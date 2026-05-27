import type { ScreeningResult } from './opensanctions';
interface PdfCheckData {
    id: string;
    createdAt: Date;
    counterparty: string;
    country: string;
    product: string;
    currency: string;
    formData: Record<string, string>;
    sanctionsHits: ScreeningResult | null;
    result: {
        overall: string;
        score: number;
        verdict: string;
        summary: string;
        red_flags: string[];
        norms: string[];
        modules: Record<string, {
            risk: string;
            score: number;
            findings: string[];
        }>;
        recs: string[];
    };
    userName: string;
    userEmail: string;
}
export declare function generateCompliancePDF(check: PdfCheckData): Promise<Buffer>;
export {};
