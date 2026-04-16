from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs" / "assets" / "readme-system-architecture.png"

WIDTH = 2200
HEIGHT = 1700

BG_TOP = (243, 247, 252)
BG_BOTTOM = (232, 241, 240)
INK = (24, 35, 58)
MUTED = (88, 103, 128)
WHITE = (255, 255, 255)
SHADOW = (40, 65, 110, 30)
ACCENT = (45, 113, 255)
ACCENT_SOFT = (227, 237, 255)
TEAL = (18, 153, 146)
TEAL_SOFT = (223, 247, 244)
AMBER = (193, 125, 39)
AMBER_SOFT = (252, 243, 227)
ROSE = (179, 74, 100)
ROSE_SOFT = (250, 232, 238)
SLATE_SOFT = (238, 242, 248)
LINE = (120, 137, 164)


def load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    candidates = [
        "C:/Windows/Fonts/msyhbd.ttc" if bold else "C:/Windows/Fonts/msyh.ttc",
        "C:/Windows/Fonts/Dengb.ttf" if bold else "C:/Windows/Fonts/Deng.ttf",
        "C:/Windows/Fonts/simhei.ttf" if bold else "C:/Windows/Fonts/simsun.ttc",
        "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
    ]
    for candidate in candidates:
        path = Path(candidate)
        if path.exists():
            return ImageFont.truetype(str(path), size=size)
    return ImageFont.load_default()


TITLE_FONT = load_font(68, bold=True)
SUBTITLE_FONT = load_font(28)
SECTION_FONT = load_font(28, bold=True)
CARD_TITLE_FONT = load_font(26, bold=True)
CARD_BODY_FONT = load_font(22)
FOOTER_FONT = load_font(20)


def make_gradient(size: tuple[int, int]) -> Image.Image:
    width, height = size
    image = Image.new("RGBA", size, BG_TOP + (255,))
    px = image.load()
    for y in range(height):
        ratio = y / max(height - 1, 1)
        color = tuple(
            int(BG_TOP[index] * (1 - ratio) + BG_BOTTOM[index] * ratio) for index in range(3)
        )
        for x in range(width):
            px[x, y] = color + (255,)
    return image


def add_blur_orb(base: Image.Image, box: tuple[int, int, int, int], color: tuple[int, int, int, int], blur: int) -> None:
    overlay = Image.new("RGBA", base.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    draw.ellipse(box, fill=color)
    base.alpha_composite(overlay.filter(ImageFilter.GaussianBlur(radius=blur)))


def rounded_card(
    canvas: Image.Image,
    box: tuple[int, int, int, int],
    *,
    fill: tuple[int, int, int],
    stroke: tuple[int, int, int] | None = None,
    radius: int = 34,
) -> None:
    shadow_layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow_layer)
    sx0, sy0, sx1, sy1 = box[0], box[1] + 12, box[2], box[3] + 12
    shadow_draw.rounded_rectangle((sx0, sy0, sx1, sy1), radius=radius, fill=SHADOW)
    canvas.alpha_composite(shadow_layer)
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle(box, radius=radius, fill=fill + (255,), outline=(stroke + (255,)) if stroke else None, width=2)


def wrap_text(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont, max_width: int) -> list[str]:
    lines: list[str] = []
    for paragraph in text.split("\n"):
        if not paragraph:
            lines.append("")
            continue
        current = ""
        for char in paragraph:
            candidate = current + char
            bbox = draw.textbbox((0, 0), candidate, font=font)
            if bbox[2] - bbox[0] <= max_width or not current:
                current = candidate
            else:
                lines.append(current)
                current = char
        if current:
            lines.append(current)
    return lines


def draw_card_content(
    canvas: Image.Image,
    box: tuple[int, int, int, int],
    *,
    title: str,
    bullets: list[str],
    accent_fill: tuple[int, int, int],
    accent_text: str,
    body_fill: tuple[int, int, int],
) -> None:
    draw = ImageDraw.Draw(canvas)
    x0, y0, x1, y1 = box
    pad_x = 26
    chip_height = 34
    chip_width = draw.textbbox((0, 0), accent_text, font=FOOTER_FONT)[2] + 28
    chip_box = (x0 + pad_x, y0 + 20, x0 + pad_x + chip_width, y0 + 20 + chip_height)
    draw.rounded_rectangle(chip_box, radius=16, fill=accent_fill + (255,))
    draw.text((chip_box[0] + 14, chip_box[1] + 6), accent_text, font=FOOTER_FONT, fill=ACCENT)
    title_y = chip_box[3] + 18
    draw.text((x0 + pad_x, title_y), title, font=CARD_TITLE_FONT, fill=INK)
    current_y = title_y + 48
    bullet_indent = 24
    max_width = x1 - x0 - pad_x * 2 - bullet_indent
    for bullet in bullets:
        wrapped = wrap_text(draw, bullet, CARD_BODY_FONT, max_width)
        dot_y = current_y + 8
        draw.ellipse((x0 + pad_x, dot_y, x0 + pad_x + 10, dot_y + 10), fill=body_fill + (255,))
        for index, line in enumerate(wrapped):
            draw.text((x0 + pad_x + bullet_indent, current_y + index * 28), line, font=CARD_BODY_FONT, fill=MUTED)
        current_y += max(34, len(wrapped) * 28 + 8)


def draw_arrow(
    draw: ImageDraw.ImageDraw,
    start: tuple[int, int],
    end: tuple[int, int],
    *,
    color: tuple[int, int, int] = LINE,
    width: int = 6,
) -> None:
    draw.line((start, end), fill=color, width=width)
    dx = end[0] - start[0]
    dy = end[1] - start[1]
    if dx == 0 and dy == 0:
        return
    if abs(dx) > abs(dy):
        if dx > 0:
            points = [(end[0], end[1]), (end[0] - 18, end[1] - 10), (end[0] - 18, end[1] + 10)]
        else:
            points = [(end[0], end[1]), (end[0] + 18, end[1] - 10), (end[0] + 18, end[1] + 10)]
    else:
        if dy > 0:
            points = [(end[0], end[1]), (end[0] - 10, end[1] - 18), (end[0] + 10, end[1] - 18)]
        else:
            points = [(end[0], end[1]), (end[0] - 10, end[1] + 18), (end[0] + 10, end[1] + 18)]
    draw.polygon(points, fill=color)


def draw_connector(draw: ImageDraw.ImageDraw, points: list[tuple[int, int]], color: tuple[int, int, int] = LINE, width: int = 6) -> None:
    for start, end in zip(points[:-1], points[1:]):
        draw.line((start, end), fill=color, width=width)
    draw_arrow(draw, points[-2], points[-1], color=color, width=width)


def main() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)

    canvas = make_gradient((WIDTH, HEIGHT))
    add_blur_orb(canvas, (110, 80, 560, 520), (103, 172, 255, 85), 75)
    add_blur_orb(canvas, (1580, 120, 2090, 680), (86, 201, 190, 70), 90)
    add_blur_orb(canvas, (760, 1180, 1320, 1660), (255, 206, 138, 55), 85)
    draw = ImageDraw.Draw(canvas)

    draw.text((120, 60), "SmartChildcare Agent 系统总架构", font=TITLE_FONT, fill=INK)
    subtitle = "基于当前仓库已落地的角色页面、工作流编排、记忆中枢与结构化输出整理"
    draw.text((120, 145), subtitle, font=SUBTITLE_FONT, fill=MUTED)

    lane_box = (120, 205, 2080, 280)
    rounded_card(canvas, lane_box, fill=WHITE, stroke=(225, 232, 243), radius=28)
    draw.text((150, 225), "系统主轴", font=SECTION_FONT, fill=INK)
    axis_text = "教师记录 -> 系统理解 -> 风险会诊 -> 园长承接 -> 家长执行 -> 反馈回流 -> 下一轮连续判断"
    draw.text((315, 226), axis_text, font=SECTION_FONT, fill=ACCENT)

    role_boxes = [
        (120, 330, 670, 560),
        (825, 330, 1375, 560),
        (1530, 330, 2080, 560),
    ]
    rounded_card(canvas, role_boxes[0], fill=WHITE, stroke=(225, 232, 243))
    rounded_card(canvas, role_boxes[1], fill=WHITE, stroke=(225, 232, 243))
    rounded_card(canvas, role_boxes[2], fill=WHITE, stroke=(225, 232, 243))
    draw_card_content(
        canvas,
        role_boxes[0],
        title="Teacher 教师端",
        bullets=["语音速记 / OCR 草稿", "草稿确认与 Teacher Copilot", "会诊发起、跟进动作与教师周报预览"],
        accent_fill=ACCENT_SOFT,
        accent_text="角色入口",
        body_fill=ACCENT,
    )
    draw_card_content(
        canvas,
        role_boxes[1],
        title="Admin 园长端",
        bullets=["高风险会诊承接", "机构优先级、决策卡与派单", "质量治理指标与运营周报工作区"],
        accent_fill=AMBER_SOFT,
        accent_text="治理入口",
        body_fill=AMBER,
    )
    draw_card_content(
        canvas,
        role_boxes[2],
        title="Parent 家长端",
        bullets=["趋势解释与继续追问", "关怀模式与微绘本入口", "结构化反馈、家庭周报与透明说明"],
        accent_fill=TEAL_SOFT,
        accent_text="家庭入口",
        body_fill=TEAL,
    )

    bridge_box = (220, 620, 1980, 820)
    rounded_card(canvas, bridge_box, fill=WHITE, stroke=(225, 232, 243))
    draw_card_content(
        canvas,
        bridge_box,
        title="交互与桥接层",
        bullets=[
            "Next.js App Router + React + TypeScript 承载移动端优先页面、角色工作台与结构化卡片。",
            "统一的 /api/ai/* 路由对前端暴露 Teacher、会诊、Parent、周报、治理等能力入口。",
            "高风险会诊支持 SSE 阶段流；角色首页与工作区共享同一套结构化结果与跳转路径。",
        ],
        accent_fill=ACCENT_SOFT,
        accent_text="Experience + Bridge",
        body_fill=ACCENT,
    )

    workflow_boxes = [
        (120, 880, 520, 1140),
        (560, 880, 960, 1140),
        (1000, 880, 1400, 1140),
        (1440, 880, 1840, 1140),
        (1680, 1180, 2080, 1440),
    ]
    memory_boxes = [
        (120, 1180, 520, 1440),
        (560, 1180, 960, 1440),
        (1000, 1180, 1400, 1440),
        (1440, 1180, 1840, 1440),
    ]

    for box in workflow_boxes[:4] + memory_boxes:
        rounded_card(canvas, box, fill=WHITE, stroke=(225, 232, 243))

    draw_card_content(
        canvas,
        workflow_boxes[0],
        title="编排中枢",
        bullets=["FastAPI Orchestrator 统一分发 Teacher、Admin、Parent、周报、治理请求。", "把多角色入口收束为一致的工作流与结构化返回。"],
        accent_fill=ACCENT_SOFT,
        accent_text="Workflow Core",
        body_fill=ACCENT,
    )
    draw_card_content(
        canvas,
        workflow_boxes[1],
        title="Teacher 工作流",
        bullets=["teacher voice understand", "草稿确认、Copilot 辅助、家长沟通与跟进建议"],
        accent_fill=ACCENT_SOFT,
        accent_text="Teacher",
        body_fill=ACCENT,
    )
    draw_card_content(
        canvas,
        workflow_boxes[2],
        title="会诊与机构治理",
        bullets=["high-risk consultation", "consultation feed、evidence chain、admin quality metrics、demand insights"],
        accent_fill=AMBER_SOFT,
        accent_text="Consultation + Admin",
        body_fill=AMBER,
    )
    draw_card_content(
        canvas,
        workflow_boxes[3],
        title="Parent 工作流",
        bullets=["parent trend query", "parent storybook", "follow-up、家庭周报与结构化反馈消费"],
        accent_fill=TEAL_SOFT,
        accent_text="Parent",
        body_fill=TEAL,
    )

    draw_card_content(
        canvas,
        memory_boxes[0],
        title="儿童画像记忆",
        bullets=["child_profile_memory 持续沉淀长期画像。", "为会诊、趋势、建议与周报提供连续上下文。"],
        accent_fill=ROSE_SOFT,
        accent_text="Memory",
        body_fill=ROSE,
    )
    draw_card_content(
        canvas,
        memory_boxes[1],
        title="状态快照",
        bullets=["agent_state_snapshots 保留会诊、建议、周报与反馈阶段结果。", "支持下一轮判断复用，而不是每次从头开始。"],
        accent_fill=ROSE_SOFT,
        accent_text="Snapshots",
        body_fill=ROSE,
    )
    draw_card_content(
        canvas,
        memory_boxes[2],
        title="轨迹与证据",
        bullets=["agent_trace_log、evidenceItems、memoryMeta 支撑过程说明与解释层。", "让系统展示判断依据，而不是只展示答案。"],
        accent_fill=ROSE_SOFT,
        accent_text="Trace",
        body_fill=ROSE,
    )
    draw_card_content(
        canvas,
        memory_boxes[3],
        title="反馈与回流",
        bullets=["结构化家长反馈、提醒、follow-up 与周报摘要回流到趋势和会诊链。", "形成连续判断与闭环治理能力。"],
        accent_fill=ROSE_SOFT,
        accent_text="Feedback Loop",
        body_fill=ROSE,
    )

    output_box = (1680, 1180, 2080, 1440)
    rounded_card(canvas, output_box, fill=WHITE, stroke=(225, 232, 243))
    draw_card_content(
        canvas,
        output_box,
        title="结构化输出层",
        bullets=["草稿确认卡、Copilot 卡、证据链、Intervention Card、Risk Priority Board、趋势图、微绘本、周报预览。", "统一以结构化结果承接后续动作。"],
        accent_fill=SLATE_SOFT,
        accent_text="Outputs",
        body_fill=LINE,
    )

    footer_box = (120, 1490, 2080, 1610)
    rounded_card(canvas, footer_box, fill=WHITE, stroke=(225, 232, 243), radius=26)
    draw.text((150, 1522), "技术口径", font=SECTION_FONT, fill=INK)
    footer_text = (
        "前端：Next.js + React + TypeScript 角色工作台 | 后端：FastAPI 编排与结构化服务 | "
        "中枢：记忆、快照、轨迹、反馈回流 | 能力接入：兼容 Qwen / DeepSeek 等国产通用大模型能力"
    )
    draw.text((315, 1524), footer_text, font=FOOTER_FONT, fill=MUTED)

    for role_box in role_boxes:
        x_center = (role_box[0] + role_box[2]) // 2
        draw_arrow(draw, (x_center, role_box[3]), (x_center, bridge_box[1] - 10))

    draw_arrow(draw, ((bridge_box[0] + bridge_box[2]) // 2, bridge_box[3]), ((bridge_box[0] + bridge_box[2]) // 2, workflow_boxes[0][1] - 14))
    draw_arrow(draw, ((bridge_box[0] + bridge_box[2]) // 2, bridge_box[3]), ((memory_boxes[1][0] + memory_boxes[1][2]) // 2, memory_boxes[1][1] - 16))

    draw_arrow(draw, (workflow_boxes[0][2], (workflow_boxes[0][1] + workflow_boxes[0][3]) // 2), (workflow_boxes[1][0] - 12, (workflow_boxes[1][1] + workflow_boxes[1][3]) // 2))
    draw_arrow(draw, (workflow_boxes[1][2], (workflow_boxes[1][1] + workflow_boxes[1][3]) // 2), (workflow_boxes[2][0] - 12, (workflow_boxes[2][1] + workflow_boxes[2][3]) // 2))
    draw_arrow(draw, (workflow_boxes[2][2], (workflow_boxes[2][1] + workflow_boxes[2][3]) // 2), (workflow_boxes[3][0] - 12, (workflow_boxes[3][1] + workflow_boxes[3][3]) // 2))

    for workflow_box, memory_box in zip(workflow_boxes[:4], memory_boxes):
        start = ((workflow_box[0] + workflow_box[2]) // 2, workflow_box[3])
        end = ((memory_box[0] + memory_box[2]) // 2, memory_box[1] - 12)
        draw_arrow(draw, start, end)

    draw_arrow(draw, ((memory_boxes[3][0] + memory_boxes[3][2]) // 2, memory_boxes[3][3]), ((footer_box[0] + footer_box[2]) // 2, footer_box[1] - 12))
    draw_arrow(draw, (memory_boxes[3][2] + 10, (memory_boxes[3][1] + memory_boxes[3][3]) // 2), (output_box[0] - 12, (output_box[1] + output_box[3]) // 2))
    draw_connector(
        draw,
        [
            (output_box[2] - 20, output_box[1] + 110),
            (2140, output_box[1] + 110),
            (2140, 760),
            (1030, 760),
            (1030, bridge_box[3] + 16),
        ],
        color=TEAL,
        width=5,
    )

    note = "SmartChildcare Agent 是角色协同系统，不是单点 AI 能力拼接。"
    draw.text((120, 1640), note, font=FOOTER_FONT, fill=MUTED)

    canvas.convert("RGB").save(OUTPUT, format="PNG", optimize=True)
    print(f"saved: {OUTPUT}")


if __name__ == "__main__":
    main()
