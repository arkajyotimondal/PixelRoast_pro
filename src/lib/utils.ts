import type { AuditMode, AuditResult } from "./types";

/** Hosting platforms cap request bodies (Vercel: 4.5 MB), so uploads must stay below this. */
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Encode compactly: WebP where the browser can encode it (Safari can't and silently
 * returns PNG), otherwise JPEG; step quality down until under the upload cap.
 */
async function encodeForUpload(canvas: HTMLCanvasElement): Promise<Blob> {
  for (const quality of [0.9, 0.8, 0.65, 0.5]) {
    let blob = await canvasToBlob(canvas, "image/webp", quality);
    if (!blob || blob.type !== "image/webp") blob = await canvasToBlob(canvas, "image/jpeg", quality);
    if (blob && blob.size <= MAX_UPLOAD_BYTES) return blob;
  }
  throw new Error("This image is too large to upload even after compression.");
}

/**
 * Resize an image (file, blob or data URL) to at most `maxWidth` px wide in the browser
 * and return both an upload-ready Blob and a preview data URL. The server re-validates
 * and re-normalises everything — this only keeps uploads small.
 */
export function prepareImage(
  source: Blob | string,
  maxWidth = 1600
): Promise<{ blob: Blob; previewUrl: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = typeof source === "string" ? null : URL.createObjectURL(source);
    img.onload = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      const previewUrl = canvas.toDataURL("image/png");
      encodeForUpload(canvas)
        .then((blob) => resolve({ blob, previewUrl }))
        .catch(reject);
    };
    img.onerror = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      reject(new Error("That file could not be read as an image."));
    };
    img.src = objectUrl ?? (source as string);
  });
}

/**
 * Generate the flawed sample UI as a data URL using Canvas
 */
export function generateFlawedSampleUI(): Promise<string> {
  return new Promise((resolve) => {
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 900;
    const ctx = canvas.getContext("2d")!;

    // Background
    ctx.fillStyle = "#f0f0f0";
    ctx.fillRect(0, 0, 1200, 900);

    // Nav bar - cluttered
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 1200, 64);
    ctx.strokeStyle = "#e0e0e0";
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, 1200, 64);

    // Logo text
    ctx.fillStyle = "#333333";
    ctx.font = "bold 18px Arial, sans-serif";
    ctx.fillText("SaaSify Pro", 20, 38);

    // Nav links - too many, cluttered
    ctx.fillStyle = "#999999"; // Low contrast nav links
    ctx.font = "13px Arial, sans-serif";
    const navItems = [
      "Products", "Solutions", "Pricing", "Resources", "Blog",
      "Docs", "Community", "About", "Contact", "Careers",
    ];
    navItems.forEach((item, i) => {
      ctx.fillText(item, 180 + i * 85, 38);
    });

    // CTA button in nav - tiny and low contrast
    ctx.fillStyle = "#d0d0d0";
    roundRect(ctx, 1070, 18, 100, 28, 4);
    ctx.fill();
    ctx.fillStyle = "#b0b0b0"; // Very low contrast text on button
    ctx.font = "11px Arial, sans-serif";
    ctx.fillText("Try Free", 1093, 37);

    // Hero section
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 64, 1200, 420);

    // Hero heading
    ctx.fillStyle = "#444444";
    ctx.font = "bold 38px Arial, sans-serif";
    ctx.fillText("The Next Generation Platform", 80, 180);
    ctx.fillText("For Modern Teams", 80, 228);

    // Subtitle - grey on white, low contrast
    ctx.fillStyle = "#b0b0b0"; // Very low contrast
    ctx.font = "16px Arial, sans-serif";
    ctx.fillText("Streamline your workflow with our innovative tools. Built for developers", 80, 270);
    ctx.fillText("who care about productivity and seamless integration.", 80, 292);

    // CTA buttons - misaligned, small
    ctx.fillStyle = "#6366f1";
    roundRect(ctx, 80, 330, 110, 32, 4); // Too small (< 44px height)
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "12px Arial, sans-serif";
    ctx.fillText("Get Started", 100, 351);

    // Secondary CTA - misaligned vertically
    ctx.fillStyle = "transparent";
    ctx.strokeStyle = "#c0c0c0";
    ctx.lineWidth = 1;
    roundRect(ctx, 210, 335, 100, 28, 4); // Different height, misaligned
    ctx.stroke();
    ctx.fillStyle = "#888888";
    ctx.font = "12px Arial, sans-serif";
    ctx.fillText("Learn More", 228, 354);

    // Hero image placeholder
    ctx.fillStyle = "#e8e8e8";
    roundRect(ctx, 650, 100, 480, 340, 8);
    ctx.fill();
    ctx.fillStyle = "#c0c0c0";
    ctx.font = "14px Arial, sans-serif";
    ctx.fillText("[Product Screenshot]", 830, 280);

    // Features section - uneven spacing
    ctx.fillStyle = "#fafafa";
    ctx.fillRect(0, 484, 1200, 320);

    ctx.fillStyle = "#555555";
    ctx.font = "bold 24px Arial, sans-serif";
    ctx.fillText("Why Choose Us", 500, 530);

    // Feature cards - inconsistent spacing
    const cardPositions = [
      { x: 60, y: 560 },
      { x: 330, y: 565 }, // Misaligned vertically
      { x: 610, y: 560 },
      { x: 880, y: 558 }, // Slightly off
    ];

    cardPositions.forEach((pos, i) => {
      ctx.fillStyle = "#ffffff";
      ctx.shadowColor = "rgba(0,0,0,0.05)";
      ctx.shadowBlur = 8;
      roundRect(ctx, pos.x, pos.y, 240, 180, 8);
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;

      // Card icon placeholder
      ctx.fillStyle = "#e0e0e0";
      ctx.beginPath();
      ctx.arc(pos.x + 30, pos.y + 35, 16, 0, Math.PI * 2);
      ctx.fill();

      // Card title
      ctx.fillStyle = "#444444";
      ctx.font = "bold 14px Arial, sans-serif";
      ctx.fillText(
        ["Fast Setup", "Real-time Sync", "Team Collab", "Analytics"][i],
        pos.x + 20,
        pos.y + 75
      );

      // Card description - low contrast
      ctx.fillStyle = "#aaaaaa"; // Low contrast text
      ctx.font = "11px Arial, sans-serif";
      ctx.fillText("Lorem ipsum dolor sit amet,", pos.x + 20, pos.y + 100);
      ctx.fillText("consectetur adipiscing elit.", pos.x + 20, pos.y + 118);
      ctx.fillText("Sed do eiusmod tempor.", pos.x + 20, pos.y + 136);
    });

    // Footer - cramped
    ctx.fillStyle = "#333333";
    ctx.fillRect(0, 820, 1200, 80);
    ctx.fillStyle = "#777777";
    ctx.font = "11px Arial, sans-serif";
    ctx.fillText(
      "© 2024 SaaSify Pro. All rights reserved. Privacy Policy Terms of Service Cookies Settings",
      80,
      860
    );

    resolve(canvas.toDataURL("image/png"));
  });
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/**
 * Generate a Markdown report from an audit result.
 */
export function generateMarkdownReport(result: AuditResult, mode: AuditMode = result.mode): string {
  const modeLabels: Record<AuditMode, string> = {
    roast: "Design Director (roast)",
    accessibility: "WCAG 2.1 AA Auditor",
    conversion: "Conversion Strategist",
  };
  const fmt = (v: number | null) => (v === null ? "not assessed" : `${v}/100`);

  let md = `# PixelRoast Pro — UI Audit Report\n\n`;
  md += `**Title:** ${result.title || "Untitled"}\n`;
  if (result.targetUrl) md += `**URL:** ${result.targetUrl}\n`;
  md += `**Persona:** ${modeLabels[mode]}\n`;
  md += `**Date:** ${(result.createdAt ?? new Date().toISOString()).split("T")[0]}\n`;
  md += `**Overall Score:** ${fmt(result.overallScore)}\n`;
  md += `**AI review:** ${result.ai.available ? `yes (${result.ai.model})` : `unavailable — ${result.ai.reason}`}\n\n`;

  md += `## Summary\n\n${result.summaries?.[mode] ?? result.summary}\n\n`;

  md += `## Category Scores\n\n| Category | Score |\n|---|---|\n`;
  md += `| Visual Hierarchy | ${fmt(result.categoryScores.hierarchy)} |\n`;
  md += `| Color & Contrast | ${fmt(result.categoryScores.contrast)} |\n`;
  md += `| Spacing & Layout | ${fmt(result.categoryScores.spacing)} |\n`;
  md += `| CTA Clarity | ${fmt(result.categoryScores.ctaClarity)} |\n`;
  md += `| Semantics & Accessibility | ${fmt(result.categoryScores.semantics)} |\n\n`;
  md += `_Scores are computed deterministically from the issues below: score = 100·e^(−P/100), where P sums Critical 20, Warning 8, Nitpick 3 per issue (AI-estimated issues ×0.75)._\n\n`;

  if (result.positives.length > 0) {
    md += `## What Works Well\n\n${result.positives.map((p) => `- ${p}`).join("\n")}\n\n`;
  }

  md += `## Issues (${result.issues.length})\n\n`;
  for (const issue of result.issues) {
    md += `### #${issue.id} [${issue.severity}] ${issue.title}\n\n`;
    md += `- **Evidence:** ${issue.evidence === "measured" ? "Measured (deterministic rule)" : "AI-estimated"}\n`;
    md += `- **Category:** ${issue.category}\n- **Heuristic:** ${issue.heuristic}\n`;
    md += `- **Location:** ${issue.selector ? `\`${issue.selector}\`` : issue.location}\n`;
    if (issue.count && issue.count > 1) md += `- **Affected elements:** ${issue.count}\n`;
    md += `\n**Problem:** ${issue.problem}\n\n**Recommendation:** ${issue.recommendation}\n\n`;
    if (issue.fixCode) md += `**Suggested fix:**\n\`\`\`html\n${issue.fixCode}\n\`\`\`\n\n`;
    md += `---\n\n`;
  }
  md += `\n*Generated by PixelRoast Pro — deterministic DOM checks + AI vision review.*\n`;
  return md;
}

/**
 * Generate JSON report from audit result
 */
export function generateJsonReport(result: AuditResult): string {
  return JSON.stringify(result, null, 2);
}
