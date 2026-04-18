"use client";

import React, { useRef, useState } from "react";
import { X, Activity, ShieldCheck, HeartPulse, Apple, FileText, Download, Circle, Square, CheckCircle2 } from "lucide-react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

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
    const [showSuccess, setShowSuccess] = useState(false);
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

    const handleDownloadPDF = async () => {
        setIsDownloading(true);
        try {
            const element = reportRef.current;
            if (!element) {
                console.error("Report element not found");
                setIsDownloading(false);
                return;
            }

            // Wait a moment for any animations to complete
            await new Promise(resolve => setTimeout(resolve, 100));

            // Create a canvas with higher quality
            const canvas = await html2canvas(element, {
                scale: 2,
                useCORS: true,
                logging: false,
                backgroundColor: "#ffffff",
                imageTimeout: 0,
                allowTaint: true,
                windowWidth: 1200,
                width: element.scrollWidth,
                height: element.scrollHeight,
                x: 0,
                y: 0,
                scrollX: 0,
                scrollY: 0,
            });

            const imgData = canvas.toDataURL("image/png", 1.0);
            
            // Create PDF
            const pdf = new jsPDF({
                orientation: "portrait",
                unit: "mm",
                format: "a4",
                compress: true,
            });

            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();
            const imgWidth = canvas.width;
            const imgHeight = canvas.height;
            const ratio = Math.min(pdfWidth / imgWidth, (pdfHeight - 20) / imgHeight);
            const imgX = (pdfWidth - imgWidth * ratio) / 2;
            const imgY = 10;

            pdf.addImage(imgData, "PNG", imgX, imgY, imgWidth * ratio, imgHeight * ratio);
            
            // Generate filename
            const filename = `MedCoreAI_Report_${diagnosis.diagnosis.replace(/\s+/g, "_").slice(0, 30)}_${new Date().toISOString().slice(0, 10)}.pdf`;
            pdf.save(filename);

            setShowSuccess(true);
            setTimeout(() => setShowSuccess(false), 3000);
        } catch (error) {
            console.error("Failed to generate PDF:", error);
            alert("Failed to generate PDF. Please try again.");
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
                className="relative max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto bg-white rounded-3xl shadow-2xl animate-in zoom-in-95 duration-300"
                style={{
                    scrollbarWidth: 'none',
                    msOverflowStyle: 'none',
                }}
            >
                <style jsx>{`
                    .scrollbar-hide::-webkit-scrollbar {
                        display: none;
                    }
                    .scrollbar-hide {
                        -ms-overflow-style: none;
                        scrollbar-width: none;
                    }
                `}</style>
                {/* Close button with animation */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-slate-900 text-white flex items-center justify-center hover:bg-slate-700 transition-all duration-300 hover:rotate-90 hover:scale-110 group"
                    aria-label="Close"
                >
                    <X className="w-5 h-5 transition-transform duration-300 group-hover:rotate-90" />
                </button>

                {/* Download button */}
                <button
                    onClick={handleDownloadPDF}
                    disabled={isDownloading}
                    className="absolute top-4 left-4 z-10 flex items-center gap-2 px-4 py-2 rounded-full bg-slate-100 text-slate-700 text-sm font-medium hover:bg-slate-200 transition-all duration-300 disabled:opacity-50"
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

                {/* Success toast */}
                {showSuccess && (
                    <div className="absolute top-20 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-4 py-2 rounded-full bg-green-600 text-white text-sm font-medium animate-in fade-in slide-in-from-top-4 duration-300">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>PDF downloaded successfully!</span>
                    </div>
                )}

                {/* Report content */}
                <div ref={reportRef} className="p-8 md:p-12">
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