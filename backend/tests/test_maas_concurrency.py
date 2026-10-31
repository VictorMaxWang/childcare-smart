from __future__ import annotations

import asyncio
import threading
from contextlib import ExitStack
from time import monotonic

import httpx
import pytest

from app.core.config import Settings
from app.providers import maas
from app.providers.base import ProviderResponseError


def provider(timeout_ms=2000):
    return maas.MaasTextProvider(Settings(ai_provider="maas", ai_api_key="synthetic-only", ai_base_url="https://synthetic.invalid/v1", ai_timeout_ms=timeout_ms))


def clients(monkeypatch, sync_post, async_post):
    class SyncClient:
        def __init__(self, **_kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            pass

        def post(self, *args, **kwargs):
            return sync_post(*args, **kwargs)

    class AsyncClient:
        def __init__(self, **_kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            pass

        async def post(self, *args, **kwargs):
            return await async_post(*args, **kwargs)

    monkeypatch.setattr(httpx, "Client", SyncClient)
    monkeypatch.setattr(httpx, "AsyncClient", AsyncClient)


async def wait_until(predicate):
    deadline = monotonic() + 2
    while not predicate():
        assert monotonic() < deadline, "synthetic concurrent request did not reach expected state"
        await asyncio.sleep(0.001)


def answer():
    return httpx.Response(200, json={"choices": [{"message": {"content": "synthetic answer"}}]})


def test_sync_and_async_text_requests_share_three_total_slots(monkeypatch):
    limiter = maas.SharedTextRequestLimiter()
    monkeypatch.setattr(maas, "_TEXT_REQUEST_LIMITER", limiter)
    lock = threading.Lock()
    release = threading.Event()
    state = {"active": 0, "maximum": 0, "sync_started": 0, "calls": 0}
    errors = []

    def enter(sync=False):
        with lock:
            state["active"] += 1
            state["maximum"] = max(state["maximum"], state["active"])
            state["calls"] += 1
            state["sync_started"] += int(sync)

    def leave():
        with lock:
            state["active"] -= 1

    def sync_post(*_args, **_kwargs):
        enter(sync=True)
        try:
            assert release.wait(2)
            return answer()
        finally:
            leave()

    async def async_post(*_args, **_kwargs):
        enter()
        try:
            await wait_until(release.is_set)
            await asyncio.sleep(0.01)
            return answer()
        finally:
            leave()

    clients(monkeypatch, sync_post, async_post)

    def run_sync():
        try:
            provider().summarize("synthetic", "")
        except BaseException as error:
            errors.append(error)

    threads = [threading.Thread(target=run_sync) for _ in range(2)]
    for thread in threads:
        thread.start()

    async def run():
        await wait_until(lambda: state["sync_started"] == 2)
        tasks = [asyncio.create_task(provider().asummarize("synthetic", "")) for _ in range(4)]
        try:
            await wait_until(lambda: limiter.waiting == 3)
            assert state["active"] == 3
        finally:
            release.set()
            await asyncio.gather(*tasks)

    try:
        asyncio.run(run())
    finally:
        release.set()
        for thread in threads:
            thread.join(2)
            assert not thread.is_alive()
    assert not errors
    assert state["maximum"] == 3 and state["calls"] == 6 and state["active"] == 0


def test_queue_rejects_above_twenty_and_cancelled_waiters_never_dispatch(monkeypatch):
    limiter = maas.SharedTextRequestLimiter()
    monkeypatch.setattr(maas, "_TEXT_REQUEST_LIMITER", limiter)
    calls = []

    def sync_post(*_args, **_kwargs):
        calls.append("sync")
        return answer()

    async def async_post(*_args, **_kwargs):
        calls.append("async")
        return answer()

    clients(monkeypatch, sync_post, async_post)

    async def run():
        with ExitStack() as occupied:
            for _ in range(3):
                occupied.enter_context(limiter.sync_slot(monotonic() + 2))
            tasks = [asyncio.create_task(provider().asummarize("queued", "")) for _ in range(20)]
            try:
                await wait_until(lambda: limiter.waiting == 20)
                with pytest.raises(ProviderResponseError, match="queue is full"):
                    await provider().asummarize("must not dispatch", "")
                assert not calls
            finally:
                for task in tasks:
                    task.cancel()
                results = await asyncio.gather(*tasks, return_exceptions=True)
                assert all(isinstance(result, asyncio.CancelledError) for result in results)
            assert limiter.waiting == 0
        await provider().asummarize("after cancellation", "")

    asyncio.run(run())
    assert calls == ["async"]


def test_sync_and_async_queued_deadlines_do_not_dispatch(monkeypatch):
    limiter = maas.SharedTextRequestLimiter()
    monkeypatch.setattr(maas, "_TEXT_REQUEST_LIMITER", limiter)
    calls = []

    def sync_post(*_args, **_kwargs):
        calls.append("sync")
        return answer()

    async def async_post(*_args, **_kwargs):
        calls.append("async")
        return answer()

    clients(monkeypatch, sync_post, async_post)
    with ExitStack() as occupied:
        for _ in range(3):
            occupied.enter_context(limiter.sync_slot(monotonic() + 2))
        with pytest.raises(ProviderResponseError, match="deadline"):
            provider(20).summarize("must not dispatch", "")
        with pytest.raises(ProviderResponseError, match="deadline"):
            asyncio.run(provider(20).asummarize("must not dispatch", ""))
    assert not calls and limiter.waiting == 0
