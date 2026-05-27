import { CheckFormData, AnalysisResult } from '../types';
export declare function analyzeCheck(formData: CheckFormData, sanctionsContext?: any): Promise<AnalysisResult>;
export declare function extractEntitiesFromDocument(text: string): Promise<{
    counterparty?: string;
    country?: string;
    product?: string;
    tnved?: string;
    currency?: string;
    value?: string;
    bank?: string;
}>;
