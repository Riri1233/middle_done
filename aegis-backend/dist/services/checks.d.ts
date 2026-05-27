import { CheckFormData } from '../types';
interface ListParams {
    userId: string;
    orgId?: string;
    page: number;
    limit: number;
    filter?: string;
    search?: string;
}
export declare function listChecks({ userId, orgId, page, limit, filter, search }: ListParams): Promise<{
    data: {
        id: string;
        createdAt: Date;
        result: import("@prisma/client/runtime/library").JsonValue;
        country: string;
        counterparty: string;
        product: string;
        currency: string;
        formData: import("@prisma/client/runtime/library").JsonValue;
        sanctionsHits: import("@prisma/client/runtime/library").JsonValue;
        riskScore: number;
        source: string;
    }[];
    total: number;
    page: number;
    hasMore: boolean;
}>;
export declare function getCheck(id: string, userId: string): Promise<{
    id: string;
    createdAt: Date;
    result: import("@prisma/client/runtime/library").JsonValue | null;
    userId: string;
    country: string;
    counterparty: string;
    product: string;
    currency: string;
    orgId: string | null;
    formData: import("@prisma/client/runtime/library").JsonValue;
    sanctionsHits: import("@prisma/client/runtime/library").JsonValue | null;
    riskScore: number | null;
    pdfUrl: string | null;
    source: string;
    documentId: string | null;
}>;
export declare function createCheck(userId: string, formData: CheckFormData): Promise<{
    id: string;
    createdAt: Date;
    result: import("@prisma/client/runtime/library").JsonValue | null;
    userId: string;
    country: string;
    counterparty: string;
    product: string;
    currency: string;
    orgId: string | null;
    formData: import("@prisma/client/runtime/library").JsonValue;
    sanctionsHits: import("@prisma/client/runtime/library").JsonValue | null;
    riskScore: number | null;
    pdfUrl: string | null;
    source: string;
    documentId: string | null;
}>;
export declare function deleteCheck(id: string, userId: string): Promise<boolean>;
export declare function buildCSV(checks: any[]): string;
export declare function getCheckStats(userId: string): Promise<{
    total: number;
    byRisk: {
        high: number;
        medium: number;
        low: number;
    };
    avgScore: number;
    trend: {
        date: string;
        score: number;
        overall: any;
    }[];
}>;
export {};
