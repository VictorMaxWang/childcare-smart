"""真实绘本文字替换后，派生媒体描述必须同步，不能继续携带种子剧情。"""
from copy import deepcopy
import json

from app.services.parent_storybook_llm import _coerce_scene


def scenes():
    rule = {"sceneIndex": 1, "sceneTitle": "种子标题", "sceneText": "种子剧情：月光翻开第一页。",
        "audioScript": "种子朗读", "imagePrompt": "温暖水彩；儿童成长绘本场景插画；种子剧情：月光积木卧室",
        "voiceStyle": "gentle-bedtime", "highlightSource": "authorized-growth-record",
        "captionTiming": {"mode": "tts-cues", "segmentTexts": ["种子字幕：月光翻开第一页。"], "segmentDurationsMs": [99000]},
        "sceneBlueprint": {"pageIndex": 1, "stage": "opening", "protagonist": {"label": "悠悠", "archetype": "bunny", "visual_cue": "黄色背带裤、圆脸、白耳朵"},
            "sceneTitle": "种子标题", "sceneGoal": "种子目标", "environment": "种子卧室", "visibleAction": "种子搭积木", "emotion": "种子情绪",
            "mustInclude": ["种子物件"], "avoid": ["文字", "水印"], "narrativeAnchor": "种子叙事", "visualAnchor": "种子画面",
            "sceneObjectCue": "种子积木", "supportCharacterCue": "种子陪伴", "activityCue": "种子活动", "emotionCue": "种子情绪", "taskCue": "种子任务"}}
    generated = {"sceneTitle": "清晨的小杯", "sceneText": "清晨阳光暖，悠悠捧小杯。大人扶着杯，悠悠看着水。",
        "audioScript": "清晨阳光暖，悠悠捧小杯。大人扶着杯，悠悠看着水。", "imagePrompt": "清晨餐桌前，大人扶着小杯，小兔悠悠注视杯中的水。"}
    return rule, generated


def test_new_captions_use_actual_audio_without_mutating_the_rule_or_history():
    rule, generated = scenes()
    before = deepcopy(rule)
    result = _coerce_scene(raw_scene=generated, rule_scene=rule, index=0)
    assert result["captionTiming"]["mode"] == "duration-derived"
    assert "".join(result["captionTiming"]["segmentTexts"]) == generated["audioScript"]
    assert len(result["captionTiming"]["segmentDurationsMs"]) == len(result["captionTiming"]["segmentTexts"])
    assert all(0 < value < 99000 for value in result["captionTiming"]["segmentDurationsMs"])
    assert rule == before


def test_image_and_scene_descriptions_follow_current_text_and_retain_only_stable_character_style():
    rule, generated = scenes()
    result = _coerce_scene(raw_scene=generated, rule_scene=rule, index=0)
    assert generated["sceneText"] in result["imagePrompt"]
    assert generated["imagePrompt"] in result["imagePrompt"]
    assert "温暖水彩" in result["imagePrompt"] and "黄色背带裤" in result["imagePrompt"]
    assert "种子" not in result["imagePrompt"]
    assert "种子" not in json.dumps(result["sceneBlueprint"], ensure_ascii=False)
    assert result["sceneBlueprint"]["protagonist"] == rule["sceneBlueprint"]["protagonist"]


def test_missing_optional_image_and_audio_fields_still_follow_generated_scene_text():
    rule, generated = scenes()
    generated.pop("imagePrompt")
    generated.pop("audioScript")
    result = _coerce_scene(raw_scene=generated, rule_scene=rule, index=0)
    assert generated["sceneText"] in result["audioScript"]
    assert generated["sceneText"] in result["imagePrompt"]
    assert "".join(result["captionTiming"]["segmentTexts"]) == result["audioScript"]
    assert "种子" not in result["imagePrompt"]
