"""
reporting.py
============
Utilities for generating call-level and analytics PDF/CSV reports.
"""

from __future__ import annotations

import csv
import os
from datetime import datetime
from typing import Dict, List, Iterable


def _escape_text(text: str) -> str:
    value = str(text or "")
    return (
        value.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def _safe_float(value, default: float = 0.0) -> float:
    try:
        if value is None:
            return float(default)
        return float(value)
    except Exception:
        return float(default)


def build_call_report_data(result: Dict) -> Dict:
    """Build normalized report fields from a call result payload."""
    compliance = _safe_float(result.get("compliance_score"), 0.0)
    efficiency = _safe_float(result.get("efficiency_score"), compliance)

    resolution = result.get("resolution_score")
    if resolution is None:
        resolution = round((compliance + efficiency) / 2.0, 1)

    return {
        "call_name": result.get("filename") or "Call Recording",
        "score": _safe_float(result.get("quality_score"), 0.0),
        "empathy": _safe_float(result.get("empathy_score"), 0.0),
        "compliance": compliance,
        "resolution": _safe_float(resolution, 0.0),
        "efficiency": efficiency,
        "summary": result.get("summary") or "No summary available.",
        "suggestions": list(result.get("improvements") or []),
        "risks": list(result.get("violations") or []),
    }


def generate_call_report_pdf(result: Dict, output_path: str) -> str:
    """Generate a call-level PDF report with score cards, charts, and guidance."""
    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
        from reportlab.lib.units import cm
        from reportlab.graphics.charts.barcharts import VerticalBarChart
        from reportlab.graphics.charts.piecharts import Pie
        from reportlab.graphics.shapes import Drawing
        from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer
    except Exception as exc:
        raise RuntimeError("reportlab is required for PDF generation") from exc

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    report = build_call_report_data(result)

    doc = SimpleDocTemplate(
        output_path,
        pagesize=A4,
        leftMargin=2.0 * cm,
        rightMargin=2.0 * cm,
        topMargin=1.8 * cm,
        bottomMargin=1.6 * cm,
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        name="ReportTitle",
        parent=styles["Title"],
        fontSize=18,
        textColor=colors.HexColor("#112240"),
        spaceAfter=8,
    )
    sub_style = ParagraphStyle(
        name="ReportSub",
        parent=styles["Normal"],
        fontSize=9,
        textColor=colors.HexColor("#6b7280"),
        spaceAfter=14,
    )
    section_style = ParagraphStyle(
        name="SectionHead",
        parent=styles["Heading3"],
        textColor=colors.HexColor("#112240"),
        fontSize=12,
        spaceAfter=6,
        spaceBefore=8,
    )
    body_style = ParagraphStyle(
        name="Body",
        parent=styles["Normal"],
        fontSize=10,
        leading=14,
        textColor=colors.HexColor("#1f2937"),
    )

    story = []
    story.append(Paragraph("EchoScore Call Evaluation Report", title_style))
    story.append(
        Paragraph(
            f"Generated: {_escape_text(datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC'))}",
            sub_style,
        )
    )

    score_lines = [
        f"<b>Call name:</b> {_escape_text(report['call_name'])}",
        f"<b>Score:</b> {report['score']:.1f}/100",
        f"<b>Empathy:</b> {report['empathy']:.1f}/100",
        f"<b>Compliance:</b> {report['compliance']:.1f}/100",
        f"<b>Resolution:</b> {report['resolution']:.1f}/100",
        f"<b>Efficiency:</b> {report['efficiency']:.1f}/100",
    ]
    story.append(Paragraph("<br/>".join(score_lines), body_style))

    story.append(Paragraph("Charts", section_style))

    bars = Drawing(460, 190)
    bar = VerticalBarChart()
    bar.x = 40
    bar.y = 35
    bar.height = 130
    bar.width = 360
    bar.data = [[
        report["score"],
        report["empathy"],
        report["compliance"],
        report["resolution"],
        report["efficiency"],
    ]]
    bar.valueAxis.valueMin = 0
    bar.valueAxis.valueMax = 100
    bar.valueAxis.valueStep = 20
    bar.categoryAxis.categoryNames = ["Score", "Empathy", "Compliance", "Resolution", "Efficiency"]
    bar.bars[0].fillColor = colors.HexColor("#4a9eff")
    bars.add(bar)
    story.append(bars)
    story.append(Spacer(1, 0.3 * cm))

    risk_count = len(report["risks"])
    suggestion_count = len(report["suggestions"])

    pie_drawing = Drawing(320, 180)
    pie = Pie()
    pie.x = 70
    pie.y = 20
    pie.width = 140
    pie.height = 140
    pie.data = [max(1, suggestion_count), max(1, risk_count)]
    pie.labels = ["Suggestions", "Risks"]
    pie.slices[0].fillColor = colors.HexColor("#22c55e")
    pie.slices[1].fillColor = colors.HexColor("#ef4444")
    pie_drawing.add(pie)
    story.append(pie_drawing)

    story.append(Paragraph("Summary", section_style))
    story.append(Paragraph(_escape_text(report["summary"]), body_style))

    story.append(Paragraph("Suggestions", section_style))
    if report["suggestions"]:
        for item in report["suggestions"][:10]:
            story.append(Paragraph(f"- {_escape_text(item)}", body_style))
    else:
        story.append(Paragraph("- No specific suggestions.", body_style))

    story.append(Paragraph("Risks", section_style))
    if report["risks"]:
        for item in report["risks"][:10]:
            story.append(Paragraph(f"- {_escape_text(item)}", body_style))
    else:
        story.append(Paragraph("- No active risks detected.", body_style))

    doc.build(story)
    return output_path


def generate_analytics_csv(rows: Iterable[Dict], output_path: str) -> str:
    """Generate CSV export from filtered admin analytics rows."""
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    fieldnames = [
        "id",
        "timestamp",
        "user_id",
        "username",
        "filename",
        "quality_score",
        "empathy_score",
        "compliance_score",
        "efficiency_score",
        "violations_count",
    ]

    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow({
                "id": row.get("id", ""),
                "timestamp": row.get("timestamp", ""),
                "user_id": row.get("user_id", ""),
                "username": row.get("username", ""),
                "filename": row.get("filename", ""),
                "quality_score": row.get("quality_score", 0),
                "empathy_score": row.get("empathy_score", 0),
                "compliance_score": row.get("compliance_score", 0),
                "efficiency_score": row.get("efficiency_score", 0),
                "violations_count": len(row.get("violations") or []),
            })

    return output_path


def generate_analytics_report_pdf(rows: List[Dict], summary: Dict, output_path: str) -> str:
    """Generate aggregated admin analytics PDF with summary and charts."""
    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
        from reportlab.lib.units import cm
        from reportlab.graphics.charts.barcharts import VerticalBarChart
        from reportlab.graphics.shapes import Drawing
        from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer
    except Exception as exc:
        raise RuntimeError("reportlab is required for PDF generation") from exc

    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    doc = SimpleDocTemplate(
        output_path,
        pagesize=A4,
        leftMargin=2.0 * cm,
        rightMargin=2.0 * cm,
        topMargin=1.8 * cm,
        bottomMargin=1.6 * cm,
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        name="AnalyticsTitle",
        parent=styles["Title"],
        fontSize=18,
        textColor=colors.HexColor("#112240"),
        spaceAfter=8,
    )
    body_style = ParagraphStyle(
        name="AnalyticsBody",
        parent=styles["Normal"],
        fontSize=10,
        leading=14,
    )

    story = [
        Paragraph("EchoScore Analytics Report", title_style),
        Paragraph(
            _escape_text(datetime.utcnow().strftime("Generated: %Y-%m-%d %H:%M UTC")),
            body_style,
        ),
        Spacer(1, 0.3 * cm),
    ]

    summary_lines = [
        f"<b>Total Calls:</b> {int(summary.get('total_calls', 0))}",
        f"<b>Average Score:</b> {float(summary.get('avg_score', 0)):.1f}",
        f"<b>Average Empathy:</b> {float(summary.get('avg_empathy', 0)):.1f}",
        f"<b>Average Compliance:</b> {float(summary.get('avg_compliance', 0)):.1f}",
        f"<b>Average Efficiency:</b> {float(summary.get('avg_efficiency', 0)):.1f}",
    ]
    story.append(Paragraph("<br/>".join(summary_lines), body_style))
    story.append(Spacer(1, 0.3 * cm))

    chart = Drawing(460, 210)
    bar = VerticalBarChart()
    bar.x = 50
    bar.y = 40
    bar.width = 340
    bar.height = 140
    bar.data = [[
        float(summary.get("avg_score", 0)),
        float(summary.get("avg_empathy", 0)),
        float(summary.get("avg_compliance", 0)),
        float(summary.get("avg_efficiency", 0)),
    ]]
    bar.categoryAxis.categoryNames = ["Score", "Empathy", "Compliance", "Efficiency"]
    bar.valueAxis.valueMin = 0
    bar.valueAxis.valueMax = 100
    bar.valueAxis.valueStep = 20
    bar.bars[0].fillColor = colors.HexColor("#4a9eff")
    chart.add(bar)
    story.append(chart)

    story.append(Spacer(1, 0.25 * cm))
    story.append(Paragraph("Top Calls", body_style))
    for row in rows[:12]:
        score = _safe_float(row.get("quality_score"), 0.0)
        line = (
            f"- {_escape_text(row.get('filename') or 'Call')} | "
            f"{_escape_text(row.get('username') or row.get('user_id') or 'unknown')} | "
            f"Score {score:.1f}"
        )
        story.append(Paragraph(line, body_style))

    doc.build(story)
    return output_path
