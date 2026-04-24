"use client";

import React, { useRef, useState } from "react";
import { X, Activity, ShieldCheck, HeartPulse, Apple, FileText, Download, Circle, Square, CheckCircle2, Sparkles, ShieldPlus, AlertTriangle } from "lucide-react";
import html2canvas from "html2canvas";
import { PDFDocument, StandardFonts } from "pdf-lib";

type DiagnosisPayload = {
    diagnosis: string;
    confidence?: number;
    source?: string;
    guidance?: {
        home_remedies?: string[];
        lifestyle_changes?: string[];
        diet_adjustments?: string[];
    };
    top_predictions?: { disease: string; probability: number }[];
    image_prediction?: {
        best_dataset?: string;
        best_label_name?: string;
        best_confidence?: number;
        per_dataset?: {
            dataset: string;
            top_label_name: string;
            top_confidence: number;
            scores?: { label_index: number; label_name: string; confidence: number }[];
        }[];
    };
    confirmed_symptoms?: string[];
    demographics?: {
        gender?: string | null;
        age_group?: string | null;
    };
    disease_info?: {
        description?: string;
        precautions?: string[];
    };
    report_analysis?: {
        symptoms?: string[];
        findings?: { finding?: string; symptom?: string; severity?: string }[];
        summary?: string;
        serious_findings?: string[];
        abnormal_findings?: string[];
        normal_findings?: string[];
    } | null;
};

type UploadedReport = {
    preview: string;
    name: string;
    type: string;
};

type UploadedImage = {
    preview: string;
    name?: string;
};

interface DiagnosisResultPopupProps {
    isOpen: boolean;
    onClose: () => void;
    diagnosis: DiagnosisPayload | null;
    uploadedReport?: UploadedReport | null;
    uploadedImage?: UploadedImage | null;
    imageIdentifiedSymptoms?: string[];
    reportIdentifiedSymptoms?: string[];
}

function labelize(text: string): string {
    return text.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function sanitizeFilenamePart(value: string): string {
    return value.replace(/[<>:"/\\|?*\x00-\x1F]+/g, "_").replace(/\s+/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
}

function uint8ArrayToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function looksLikePdf(report?: UploadedReport | null): boolean {
    if (!report) {
        return false;
    }

    const reportType = report.type?.toLowerCase() || "";
    const reportName = report.name?.toLowerCase() || "";
    const reportPreview = report.preview?.toLowerCase() || "";

    return reportType.includes("pdf")
        || reportName.endsWith(".pdf")
        || reportPreview.startsWith("data:application/pdf");
}

function triggerPdfDownload(pdfBytes: Uint8Array, filename: string) {
    if (pdfBytes.length === 0) {
        throw new Error("Generated PDF is empty");
    }

    const blob = new Blob([uint8ArrayToArrayBuffer(pdfBytes)], { type: "application/pdf" });
    const legacyNavigator = window.navigator as Navigator & {
        msSaveOrOpenBlob?: (blob: Blob, defaultName?: string) => boolean;
    };

    if (legacyNavigator.msSaveOrOpenBlob) {
        legacyNavigator.msSaveOrOpenBlob(blob, filename);
        return;
    }

    const downloadUrl = URL.createObjectURL(blob);
    const downloadLink = document.createElement("a");
    downloadLink.href = downloadUrl;
    downloadLink.download = filename;
    downloadLink.style.display = "none";
    downloadLink.rel = "noopener noreferrer";
    document.body.appendChild(downloadLink);

    try {
        downloadLink.click();
    } finally {
        document.body.removeChild(downloadLink);
    }

    window.setTimeout(() => {
        URL.revokeObjectURL(downloadUrl);
    }, 60000);
}

function sanitizeClonedDocument(clonedDoc: Document) {
    const allElements = clonedDoc.querySelectorAll<HTMLElement>("*");
    allElements.forEach((el) => {
        const computed = clonedDoc.defaultView?.getComputedStyle(el);
        if (!computed) {
            return;
        }

        if (computed.backgroundColor.includes("lab(")) {
            el.style.backgroundColor = "#ffffff";
        }
        if (computed.color.includes("lab(")) {
            el.style.color = "#0f172a";
        }
        if (computed.borderColor.includes("lab(")) {
            el.style.borderColor = "#e2e8f0";
        }
    });
}

async function canvasToPngBytes(canvas: HTMLCanvasElement): Promise<ArrayBuffer> {
    const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((value) => {
            if (value) {
                resolve(value);
                return;
            }
            reject(new Error("Failed to convert canvas into PNG blob"));
        }, "image/png", 1.0);
    });

    return blob.arrayBuffer();
}

async function captureReportCanvas(element: HTMLDivElement): Promise<HTMLCanvasElement> {
    const rect = element.getBoundingClientRect();
    const renderWidth = Math.max(Math.ceil(rect.width), element.scrollWidth, 800);
    const renderHeight = Math.max(element.scrollHeight, element.offsetHeight);

    const baseOptions = {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
        imageTimeout: 30000,
        allowTaint: false,
        windowWidth: renderWidth,
        windowHeight: renderHeight,
        width: renderWidth,
        height: renderHeight,
        x: 0,
        y: 0,
        scrollX: 0,
        scrollY: 0,
        foreignObjectRendering: false,
        removeContainer: true,
        ignoreElements: (el: Element) => {
            if (el.tagName === "BUTTON" && el.closest("[data-ignore-in-pdf]")) {
                return true;
            }
            return false;
        },
        onclone: sanitizeClonedDocument,
    } satisfies Parameters<typeof html2canvas>[1];

    const captureRoot = document.createElement("div");
    captureRoot.style.position = "fixed";
    captureRoot.style.left = "-10000px";
    captureRoot.style.top = "0";
    captureRoot.style.width = `${renderWidth}px`;
    captureRoot.style.padding = "0";
    captureRoot.style.margin = "0";
    captureRoot.style.background = "#ffffff";
    captureRoot.style.zIndex = "-1";

    const clonedElement = element.cloneNode(true) as HTMLDivElement;
    clonedElement.style.width = `${renderWidth}px`;
    clonedElement.style.maxHeight = "none";
    clonedElement.style.height = "auto";
    clonedElement.style.overflow = "visible";
    clonedElement.style.padding = getComputedStyle(element).padding;
    captureRoot.appendChild(clonedElement);
    document.body.appendChild(captureRoot);

    try {
        return await html2canvas(clonedElement, baseOptions);
    } catch (error) {
        console.warn("Hidden popup capture failed, retrying with the visible popup.", error);
        return html2canvas(element, {
            ...baseOptions,
            windowWidth: Math.max(window.innerWidth, renderWidth),
            windowHeight: Math.max(window.innerHeight, renderHeight),
        });
    } finally {
        document.body.removeChild(captureRoot);
    }
}

function wrapPdfText(text: string, maxChars = 92): string[] {
    return text
        .split("\n")
        .flatMap((paragraph) => {
            const trimmed = paragraph.trim();
            if (!trimmed) {
                return [""];
            }

            const words = trimmed.split(/\s+/);
            const lines: string[] = [];
            let current = "";

            for (const word of words) {
                const next = current ? `${current} ${word}` : word;
                if (next.length > maxChars) {
                    if (current) {
                        lines.push(current);
                    }
                    current = word;
                } else {
                    current = next;
                }
            }

            if (current) {
                lines.push(current);
            }

            return lines;
        });
}

async function appendTextFallbackPdf(
    pdfDoc: PDFDocument,
    diagnosis: DiagnosisPayload,
    imageIdentifiedSymptoms: string[],
    reportIdentifiedSymptoms: string[]
) {
    const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const pageWidth = 595.28;
    const pageHeight = 841.89;
    const margin = 42;
    const lineHeight = 18;

    const sections = [
        `MedCoreAI Diagnostic Report`,
        "",
        `Likely condition: ${labelize(diagnosis.diagnosis)}`,
        `Confidence: ${Number(diagnosis.confidence || 0).toFixed(1)}%`,
        `Profile: ${labelize(String(diagnosis.demographics?.gender || "unknown"))}, ${labelize(String(diagnosis.demographics?.age_group || "unknown"))}`,
        "",
        `Symptoms: ${(diagnosis.confirmed_symptoms || []).map(labelize).join(", ") || "No symptoms captured"}`,
        "",
        `What this means: ${diagnosis.disease_info?.description || "No additional description available."}`,
        "",
        `Home remedies: ${(diagnosis.guidance?.home_remedies || []).join("; ") || "None listed."}`,
        `Lifestyle changes: ${(diagnosis.guidance?.lifestyle_changes || []).join("; ") || "None listed."}`,
        `Diet adjustments: ${(diagnosis.guidance?.diet_adjustments || []).join("; ") || "None listed."}`,
        "",
        `Image analysis signals: ${imageIdentifiedSymptoms.map(labelize).join(", ") || "None captured."}`,
        `Report analysis signals: ${reportIdentifiedSymptoms.map(labelize).join(", ") || "None captured."}`,
        "",
        `This report is informational and not a final medical diagnosis. Please consult a qualified healthcare provider.`,
    ];

    const lines = wrapPdfText(sections.join("\n"));
    let page = pdfDoc.addPage([pageWidth, pageHeight]);
    let cursorY = pageHeight - margin;

    for (const [index, line] of lines.entries()) {
        if (cursorY < margin) {
            page = pdfDoc.addPage([pageWidth, pageHeight]);
            cursorY = pageHeight - margin;
        }

        const isHeading = index === 0;
        page.drawText(line, {
            x: margin,
            y: cursorY,
            size: isHeading ? 18 : 11,
            font: isHeading ? boldFont : regularFont,
        });
        cursorY -= isHeading ? 28 : lineHeight;
    }
}

async function appendCanvasToPdf(pdfDoc: PDFDocument, canvas: HTMLCanvasElement) {
    const pageWidth = 595.28;
    const pageHeight = 841.89;
    const margin = 24;
    const usableWidth = pageWidth - margin * 2;
    const usableHeight = pageHeight - margin * 2;
    const pageCanvasHeight = Math.floor((usableHeight * canvas.width) / usableWidth);

    let offsetY = 0;
    while (offsetY < canvas.height) {
        const sliceHeight = Math.min(pageCanvasHeight, canvas.height - offsetY);
        const pageCanvas = document.createElement("canvas");
        pageCanvas.width = canvas.width;
        pageCanvas.height = sliceHeight;

        const pageContext = pageCanvas.getContext("2d");
        if (!pageContext) {
            throw new Error("Failed to prepare PDF page");
        }

        pageContext.fillStyle = "#ffffff";
        pageContext.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
        pageContext.drawImage(
            canvas,
            0,
            offsetY,
            canvas.width,
            sliceHeight,
            0,
            0,
            canvas.width,
            sliceHeight
        );

        const embeddedImage = await pdfDoc.embedPng(await canvasToPngBytes(pageCanvas));
        const renderedHeight = (sliceHeight * usableWidth) / canvas.width;
        const page = pdfDoc.addPage([pageWidth, pageHeight]);
        page.drawImage(embeddedImage, {
            x: margin,
            y: pageHeight - margin - renderedHeight,
            width: usableWidth,
            height: renderedHeight,
        });

        offsetY += sliceHeight;
    }
}

async function appendImageToPdf(pdfDoc: PDFDocument, imageUrl: string, label?: string) {
    const imageElement = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("Failed to load uploaded image"));
        img.src = imageUrl;
    });

    const imageCanvas = document.createElement("canvas");
    imageCanvas.width = imageElement.naturalWidth || imageElement.width;
    imageCanvas.height = imageElement.naturalHeight || imageElement.height;

    const imageContext = imageCanvas.getContext("2d");
    if (!imageContext) {
        throw new Error("Failed to process uploaded image");
    }

    imageContext.fillStyle = "#ffffff";
    imageContext.fillRect(0, 0, imageCanvas.width, imageCanvas.height);
    imageContext.drawImage(imageElement, 0, 0, imageCanvas.width, imageCanvas.height);

    const embeddedImage = await pdfDoc.embedPng(await canvasToPngBytes(imageCanvas));

    const page = pdfDoc.addPage();
    const { width: pageWidth, height: pageHeight } = page.getSize();
    const margin = 36;
    const titleSize = 16;
    const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const labelText = label?.trim() ? label : "Uploaded Medical Image";

    page.drawText(labelText, {
        x: margin,
        y: pageHeight - margin,
        size: titleSize,
        font,
    });

    const availableWidth = pageWidth - margin * 2;
    const availableHeight = pageHeight - margin * 3 - titleSize;
    const scaled = embeddedImage.scale(
        Math.min(availableWidth / embeddedImage.width, availableHeight / embeddedImage.height)
    );

    page.drawImage(embeddedImage, {
        x: (pageWidth - scaled.width) / 2,
        y: margin,
        width: scaled.width,
        height: scaled.height,
    });
}

async function appendExistingPdf(pdfDoc: PDFDocument, pdfUrl: string) {
    const reportResponse = await fetch(pdfUrl);
    if (!reportResponse.ok) {
        throw new Error("Failed to load uploaded report");
    }

    const reportBytes = await reportResponse.arrayBuffer();
    const reportPdf = await PDFDocument.load(reportBytes);
    const copiedPages = await pdfDoc.copyPages(reportPdf, reportPdf.getPageIndices());
    copiedPages.forEach((page) => pdfDoc.addPage(page));
}

async function downloadPdfDocument(pdfDoc: PDFDocument, filename: string) {
    const pdfBytes = await pdfDoc.save();
    triggerPdfDownload(pdfBytes, filename);
}

export default function DiagnosisResultPopup({
    isOpen,
    onClose,
    diagnosis,
    uploadedReport,
    uploadedImage,
    imageIdentifiedSymptoms = [],
    reportIdentifiedSymptoms = [],
}: DiagnosisResultPopupProps) {
    const [isDownloading, setIsDownloading] = useState(false);
    const [downloadFeedback, setDownloadFeedback] = useState<"success" | "error" | null>(null);
    const [isClosingSuccessCard, setIsClosingSuccessCard] = useState(false);
    const reportRef = useRef<HTMLDivElement>(null);

    if (!isOpen || !diagnosis) return null;

    const confidence = Number(diagnosis.confidence || 0);
    const panelPredictions = diagnosis.top_predictions || [];
    const symptoms = diagnosis.confirmed_symptoms || [];
    const description = diagnosis.disease_info?.description || "";
    const gender = diagnosis.demographics?.gender || "unknown";
    const ageGroup = diagnosis.demographics?.age_group || "unknown";
    const homeRemedies = diagnosis.guidance?.home_remedies || [];
    const lifestyleChanges = diagnosis.guidance?.lifestyle_changes || [];
    const dietAdjustments = diagnosis.guidance?.diet_adjustments || [];

    const handleCloseSuccessCard = () => {
        if (isClosingSuccessCard) return;

        setIsClosingSuccessCard(true);
        window.setTimeout(() => {
            setDownloadFeedback(null);
            setIsClosingSuccessCard(false);
        }, 1050);
    };

    const handleDownloadPDF = async () => {
        setIsDownloading(true);
        const safeDiagnosisName = sanitizeFilenamePart(diagnosis.diagnosis).slice(0, 30) || "Diagnosis";
        const filename = `MedCoreAI_Report_${safeDiagnosisName}_${new Date().toISOString().slice(0, 10)}.pdf`;

        try {
            const element = reportRef.current;
            if (!element) {
                throw new Error("Report content not available");
            }

            await document.fonts.ready;
            await new Promise((resolve) => setTimeout(resolve, 200));
            const canvas = await captureReportCanvas(element);

            if (!canvas) {
                throw new Error("Failed to create canvas from report content");
            }

            const finalPdf = await PDFDocument.create();
            await appendCanvasToPdf(finalPdf, canvas);

            if (uploadedImage?.preview) {
                try {
                    await appendImageToPdf(finalPdf, uploadedImage.preview, uploadedImage.name);
                } catch (attachmentError) {
                    console.warn("Image attachment could not be added to the PDF.", attachmentError);
                }
            }

            if (uploadedReport?.preview && looksLikePdf(uploadedReport)) {
                try {
                    await appendExistingPdf(finalPdf, uploadedReport.preview);
                } catch (attachmentError) {
                    console.warn("Report attachment could not be merged into the PDF.", attachmentError);
                }
            }

            setIsClosingSuccessCard(false);
            await downloadPdfDocument(finalPdf, filename);
            setDownloadFeedback("success");
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Unknown error";
            console.error("Failed to generate PDF:", errorMessage);
            try {
                const emergencyPdf = await PDFDocument.create();
                await appendTextFallbackPdf(emergencyPdf, diagnosis, imageIdentifiedSymptoms, reportIdentifiedSymptoms);

                if (uploadedImage?.preview) {
                    try {
                        await appendImageToPdf(emergencyPdf, uploadedImage.preview, uploadedImage.name);
                    } catch (attachmentError) {
                        console.warn("Image attachment could not be added to the emergency PDF.", attachmentError);
                    }
                }

                if (uploadedReport?.preview && looksLikePdf(uploadedReport)) {
                    try {
                        await appendExistingPdf(emergencyPdf, uploadedReport.preview);
                    } catch (attachmentError) {
                        console.warn("Report attachment could not be merged into the emergency PDF.", attachmentError);
                    }
                }

                setIsClosingSuccessCard(false);
                await downloadPdfDocument(emergencyPdf, filename);
                setDownloadFeedback("success");
            } catch (fallbackError) {
                console.error("Emergency PDF generation failed:", fallbackError);
                setDownloadFeedback("error");
                setTimeout(() => setDownloadFeedback(null), 4200);
            }
        } finally {
            setIsDownloading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Animated backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300"
                onClick={onClose}
            />

            {/* Main popup container */}
            <div
                className="relative max-w-4xl w-full mx-4 max-h-[90vh] bg-white rounded-3xl shadow-2xl animate-in zoom-in-95 duration-300 flex flex-col"
                style={{
                    scrollbarWidth: 'none',
                    msOverflowStyle: 'none',
                }}
            >
                <style jsx>{`
                    div::-webkit-scrollbar {
                        display: none;
                    }
                    div {
                        -ms-overflow-style: none;
                        scrollbar-width: none;
                    }
                    @keyframes success-fly-1 {
                        0% { transform: translate(0, 0) scale(0.7) rotate(0deg); opacity: 0; }
                        20% { opacity: 1; }
                        100% { transform: translate(-180px, -240px) scale(1.4) rotate(-16deg); opacity: 0; }
                    }
                    @keyframes success-fly-2 {
                        0% { transform: translate(0, 0) scale(0.7) rotate(0deg); opacity: 0; }
                        20% { opacity: 1; }
                        100% { transform: translate(-260px, 190px) scale(1.35) rotate(24deg); opacity: 0; }
                    }
                    @keyframes success-fly-3 {
                        0% { transform: translate(0, 0) scale(0.7) rotate(0deg); opacity: 0; }
                        20% { opacity: 1; }
                        100% { transform: translate(240px, -220px) scale(1.3) rotate(18deg); opacity: 0; }
                    }
                    @keyframes success-fly-4 {
                        0% { transform: translate(0, 0) scale(0.7) rotate(0deg); opacity: 0; }
                        20% { opacity: 1; }
                        100% { transform: translate(230px, 200px) scale(1.35) rotate(-24deg); opacity: 0; }
                    }
                    @keyframes success-burst {
                        0% { transform: translate(-50%, -50%) scale(0.5); opacity: 0; }
                        18% { opacity: 1; }
                        100% { transform: translate(-50%, -50%) scale(5.5); opacity: 0; }
                    }
                `}</style>

                {/* Fixed header with buttons */}
                <div className="sticky top-0 z-20 bg-white rounded-t-3xl px-6 py-4 flex items-center justify-between border-b border-slate-100">
                    {/* Download button */}
                    <button
                        onClick={handleDownloadPDF}
                        disabled={isDownloading}
                        className="flex items-center gap-2 px-4 py-2 rounded-full bg-slate-100 text-slate-700 text-sm font-medium hover:bg-slate-200 transition-all duration-300 disabled:opacity-50"
                    >
                        {isDownloading ? (
                            <>
                                <div className="w-4 h-4 border-2 border-slate-600 border-t-transparent rounded-full animate-spin" />
                                <span>Generating...</span>
                            </>
                        ) : (
                            <>
                                <Download className="w-4 h-4" />
                                <span>Download PDF</span>
                            </>
                        )}
                    </button>

                    {/* Close button with animation */}
                    <button
                        onClick={onClose}
                        className="w-10 h-10 rounded-full bg-slate-900 text-white flex items-center justify-center hover:bg-slate-700 transition-all duration-300 hover:rotate-90 hover:scale-110 group"
                        aria-label="Close"
                    >
                        <X className="w-5 h-5 transition-transform duration-300 group-hover:rotate-90" />
                    </button>
                </div>

                {downloadFeedback === "success" && (
                    <div className="absolute inset-0 z-30 flex items-center justify-center overflow-hidden rounded-3xl bg-slate-950/12 backdrop-blur-[2px]">
                        {isClosingSuccessCard && (
                            <>
                                <div className="pointer-events-none absolute left-[12%] top-[18%] text-4xl animate-[success-fly-1_1s_ease-in_forwards]">✨</div>
                                <div className="pointer-events-none absolute left-[22%] bottom-[22%] text-5xl animate-[success-fly-2_1s_ease-in_forwards]">🕊️</div>
                                <div className="pointer-events-none absolute right-[14%] top-[20%] text-4xl animate-[success-fly-3_1s_ease-in_forwards]">💙</div>
                                <div className="pointer-events-none absolute right-[20%] bottom-[18%] text-5xl animate-[success-fly-4_1s_ease-in_forwards]">🌿</div>
                                <div className="pointer-events-none absolute left-1/2 top-1/2 text-6xl animate-[success-burst_0.95s_ease-in_forwards]">🫶</div>
                            </>
                        )}

                        <div className={`relative w-[460px] max-w-[94%] overflow-hidden rounded-[34px] border border-teal-200/80 bg-gradient-to-br from-white via-teal-50 to-cyan-50 p-8 shadow-[0_26px_90px_rgba(15,23,42,0.22)] transition-all duration-700 ${isClosingSuccessCard ? "scale-[0.82] opacity-0 blur-[1px]" : "scale-100 opacity-100 animate-in fade-in zoom-in-95 duration-500"}`}>
                            <div className="absolute -right-6 -top-6 h-32 w-32 rounded-full bg-teal-200/40 blur-3xl animate-pulse" />
                            <div className="absolute -left-5 bottom-0 h-24 w-24 rounded-full bg-cyan-200/40 blur-3xl animate-pulse" />
                            <div className="absolute right-8 top-7 rounded-full bg-white/70 px-3 py-1 text-xs font-semibold tracking-[0.18em] text-teal-700 shadow-sm">
                                PDF READY
                            </div>

                            <div className="mx-auto mb-5 relative flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-teal-600 via-cyan-600 to-slate-700 shadow-lg">
                                <div className="absolute inset-[-10px] rounded-full border-2 border-teal-300/70 animate-ping" />
                                <ShieldPlus className="h-11 w-11 text-white" />
                                <Sparkles className="absolute -right-1 top-1 h-5 w-5 text-cyan-100 animate-pulse" />
                            </div>

                            <div className="text-center">
                                <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-teal-100 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.24em] text-teal-700">
                                    <CheckCircle2 className="h-4 w-4" />
                                    Report Prepared
                                </div>
                                <h3 className="text-3xl font-bold tracking-tight text-slate-900">Thank you for trusting MedCoreAI</h3>
                                <p className="mt-3 text-base leading-relaxed text-slate-600">
                                    Your complete medical report has been downloaded successfully and is ready for review.
                                </p>
                                <p className="mt-4 rounded-3xl border border-teal-100 bg-white/80 px-5 py-4 text-[15px] leading-relaxed text-slate-700">
                                    Please remember: one careful step at a time matters. With the right guidance, support, and follow-up, positive progress is always possible.
                                </p>
                                <button
                                    type="button"
                                    onClick={handleCloseSuccessCard}
                                    disabled={isClosingSuccessCard}
                                    className="mt-5 inline-flex items-center gap-3 rounded-full bg-gradient-to-r from-teal-600 via-cyan-600 to-slate-700 px-6 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(8,145,178,0.28)] transition-all duration-300 hover:scale-105 hover:shadow-[0_20px_50px_rgba(8,145,178,0.34)] disabled:cursor-default disabled:opacity-90"
                                >
                                    <span className={`text-xl transition-transform duration-500 ${isClosingSuccessCard ? "translate-x-[280px] -translate-y-[180px] rotate-45 scale-125" : ""}`}>🕊️</span>
                                    <span>{isClosingSuccessCard ? "Sending warm wishes..." : "Close with Blessing Flight"}</span>
                                    <Sparkles className={`h-4 w-4 transition-transform duration-500 ${isClosingSuccessCard ? "-translate-x-[220px] translate-y-[140px] rotate-180 scale-125" : ""}`} />
                                </button>
                                <p className="mt-4 text-xs uppercase tracking-[0.2em] text-slate-500">
                                    Wishing you steadiness, strength, and peace
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {downloadFeedback === "error" && (
                    <div className="absolute top-20 left-1/2 z-30 w-[min(92%,420px)] -translate-x-1/2 animate-in fade-in slide-in-from-top-4 duration-300">
                        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 shadow-lg">
                            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100">
                                <AlertTriangle className="h-4 w-4" />
                            </div>
                            <div>
                                <p className="text-sm font-semibold">PDF report is not working right now</p>
                                <p className="mt-1 text-xs leading-relaxed text-amber-800">
                                    Please try again, or take a screenshot of the result popup for now.
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Scrollable Report content */}
                <div ref={reportRef} className="flex-1 overflow-y-auto p-8 md:p-12">
                    {/* Header with branding */}
                    <div className="flex items-center justify-between mb-8 pb-6 border-b-2 border-slate-900">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-xl bg-slate-900 flex items-center justify-center">
                                <Activity className="w-6 h-6 text-white" />
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">MedCoreAI</h1>
                                <p className="text-xs text-slate-500 uppercase tracking-wider">Diagnostic Report</p>
                            </div>
                        </div>
                        <div className="text-right">
                            <p className="text-sm text-slate-600">
                                {new Date().toLocaleDateString("en-US", {
                                    year: "numeric",
                                    month: "long",
                                    day: "numeric",
                                })}
                            </p>
                            <p className="text-xs text-slate-400">
                                {new Date().toLocaleTimeString("en-US", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                })}
                            </p>
                        </div>
                    </div>

                    {/* Main diagnosis section */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                        {/* Likely Condition Card */}
                        <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-6 shadow-lg">
                            <div className="flex items-center gap-2 text-slate-300 text-xs uppercase tracking-wider font-semibold mb-3">
                                <Circle className="w-4 h-4" />
                                <span>Likely Condition</span>
                            </div>
                            <h2 className="text-2xl font-bold mb-2">{labelize(diagnosis.diagnosis)}</h2>
                            <div className="flex items-center gap-4 mt-4">
                                <div
                                    className="h-20 w-20 rounded-full grid place-items-center text-sm font-bold"
                                    style={{
                                        background: `conic-gradient(#ffffff ${confidence}%, #475569 ${confidence}% 100%)`,
                                    }}
                                >
                                    <div className="h-14 w-14 rounded-full bg-slate-900 grid place-items-center">
                                        {Math.round(confidence)}%
                                    </div>
                                </div>
                                <div className="text-sm text-slate-300">
                                    <p className="font-semibold text-white">Confidence Score</p>
                                    <p className="text-xs mt-1">Based on your symptoms and analysis</p>
                                </div>
                            </div>
                        </div>

                        {/* Symptoms & Profile Card */}
                        <div className="rounded-2xl border-2 border-slate-200 bg-white p-6">
                            <div className="flex items-center gap-2 text-slate-600 text-xs uppercase tracking-wider font-semibold mb-4">
                                <Square className="w-4 h-4" />
                                <span>Symptoms & Profile</span>
                            </div>
                            <div className="space-y-4">
                                <div>
                                    <p className="text-xs text-slate-400 uppercase tracking-wide mb-2">Symptoms</p>
                                    <div className="flex flex-wrap gap-2">
                                        {symptoms.length > 0 ? (
                                            symptoms.map((symptom, idx) => (
                                                <span
                                                    key={idx}
                                                    className="px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-medium"
                                                >
                                                    {labelize(symptom)}
                                                </span>
                                            ))
                                        ) : (
                                            <span className="text-sm text-slate-500">No symptoms captured</span>
                                        )}
                                    </div>
                                </div>
                                <div>
                                    <p className="text-xs text-slate-400 uppercase tracking-wide mb-2">Profile</p>
                                    <p className="text-sm text-slate-700 font-medium">
                                        {labelize(String(gender))}, {labelize(String(ageGroup))}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Uploaded files section */}
                    {(uploadedImage || uploadedReport) && (
                        <div className="mb-8">
                            <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wider mb-4">
                                Uploaded Files
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {uploadedImage && (
                                    <div className="rounded-xl border border-slate-200 p-4">
                                        <p className="text-xs font-semibold text-slate-500 mb-3">Medical Image</p>
                                        <img
                                            src={uploadedImage.preview}
                                            alt={uploadedImage.name || "Medical image"}
                                            className="w-full h-32 object-cover rounded-lg"
                                        />
                                        {uploadedImage.name && (
                                            <p className="text-xs text-slate-400 mt-2 truncate">{uploadedImage.name}</p>
                                        )}
                                    </div>
                                )}
                                {uploadedReport && (
                                    <div className="rounded-xl border border-slate-200 p-4 flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-lg bg-red-100 flex items-center justify-center shrink-0">
                                            <FileText className="w-6 h-6 text-red-600" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-semibold text-slate-500 mb-1">Medical Report</p>
                                            <p className="text-sm font-medium text-slate-700 truncate">
                                                {uploadedReport.name}
                                            </p>
                                            <p className="text-xs text-slate-400">PDF Document</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Identified symptoms from image/report analysis */}
                    {(imageIdentifiedSymptoms.length > 0 || reportIdentifiedSymptoms.length > 0) && (
                        <div className="mb-8">
                            <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wider mb-4">
                                Symptoms Identified So Far
                            </h3>
                            <div className="space-y-4">
                                {imageIdentifiedSymptoms.length > 0 && (
                                    <div className="rounded-xl border border-slate-200 p-4">
                                        <p className="text-xs text-slate-500 mb-2 uppercase tracking-wide">From Image Analysis</p>
                                        <div className="flex flex-wrap gap-2">
                                            {imageIdentifiedSymptoms.map((symptom, idx) => (
                                                <span
                                                    key={`img-${idx}`}
                                                    className="px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-medium border border-blue-200"
                                                >
                                                    {labelize(symptom)}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {reportIdentifiedSymptoms.length > 0 && (
                                    <div className="rounded-xl border border-slate-200 p-4">
                                        <p className="text-xs text-slate-500 mb-2 uppercase tracking-wide">From Report Analysis</p>
                                        <div className="flex flex-wrap gap-2">
                                            {reportIdentifiedSymptoms.map((symptom, idx) => (
                                                <span
                                                    key={`rep-${idx}`}
                                                    className="px-3 py-1 rounded-full bg-purple-50 text-purple-700 text-xs font-medium border border-purple-200"
                                                >
                                                    {labelize(symptom)}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* What This Means section */}
                    {description && (
                        <div className="mb-8">
                            <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wider mb-4">
                                What This Means
                            </h3>
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
                                <p className="text-slate-700 leading-relaxed">{description}</p>
                            </div>
                        </div>
                    )}

                    {/* Dataset Prediction Chart */}
                    {panelPredictions.length > 0 && (
                        <div className="mb-8">
                            <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wider mb-4">
                                Dataset Prediction Chart
                            </h3>
                            <div className="rounded-2xl border border-slate-200 bg-white p-6">
                                <div className="space-y-4">
                                    {panelPredictions.slice(0, 5).map((pred, idx) => (
                                        <div key={pred.disease}>
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-sm font-medium text-slate-700">
                                                    {labelize(pred.disease)}
                                                </span>
                                                <span className="text-sm text-slate-500 font-semibold">
                                                    {pred.probability.toFixed(1)}%
                                                </span>
                                            </div>
                                            <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
                                                <div
                                                    className="h-full rounded-full bg-gradient-to-r from-slate-900 to-slate-600 transition-all duration-500"
                                                    style={{ width: `${pred.probability}%` }}
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Home Remedies */}
                    {homeRemedies.length > 0 && (
                        <div className="mb-8">
                            <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wider mb-4 flex items-center gap-2">
                                <HeartPulse className="w-4 h-4" />
                                Home Remedies
                            </h3>
                            <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-6">
                                <ul className="space-y-3">
                                    {homeRemedies.map((item, idx) => (
                                        <li key={idx} className="flex items-start gap-3">
                                            <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center shrink-0 mt-0.5">
                                                <span className="text-xs font-bold text-slate-600">{idx + 1}</span>
                                            </div>
                                            <span className="text-slate-700 text-sm leading-relaxed">{item}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    )}

                    {/* Lifestyle Changes */}
                    {lifestyleChanges.length > 0 && (
                        <div className="mb-8">
                            <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wider mb-4 flex items-center gap-2">
                                <ShieldCheck className="w-4 h-4" />
                                Lifestyle Changes
                            </h3>
                            <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-6">
                                <ul className="space-y-3">
                                    {lifestyleChanges.map((item, idx) => (
                                        <li key={idx} className="flex items-start gap-3">
                                            <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center shrink-0 mt-0.5">
                                                <span className="text-xs font-bold text-slate-600">{idx + 1}</span>
                                            </div>
                                            <span className="text-slate-700 text-sm leading-relaxed">{item}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    )}

                    {/* Diet Adjustments */}
                    {dietAdjustments.length > 0 && (
                        <div className="mb-8">
                            <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wider mb-4 flex items-center gap-2">
                                <Apple className="w-4 h-4" />
                                Diet Adjustments
                            </h3>
                            <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-6">
                                <ul className="space-y-3">
                                    {dietAdjustments.map((item, idx) => (
                                        <li key={idx} className="flex items-start gap-3">
                                            <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center shrink-0 mt-0.5">
                                                <span className="text-xs font-bold text-slate-600">{idx + 1}</span>
                                            </div>
                                            <span className="text-slate-700 text-sm leading-relaxed">{item}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    )}

                    {/* Footer disclaimer */}
                    <div className="mt-8 pt-6 border-t border-slate-200">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center">
                                    <Activity className="w-4 h-4 text-white" />
                                </div>
                                <span className="text-xs text-slate-500">MedCoreAI Diagnostic System</span>
                            </div>
                            <p className="text-xs text-slate-400 text-center max-w-md">
                                This is informational only and not a final medical diagnosis. Always consult a qualified healthcare provider.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
