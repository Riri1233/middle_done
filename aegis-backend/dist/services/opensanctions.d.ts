export interface SanctionsHit {
    id: string;
    caption: string;
    schema: string;
    score: number;
    datasets: string[];
    topics: string[];
    aliases: string[];
    countries: string[];
    sanctionedBy: string[];
    isSanctioned: boolean;
    isHighConfidence: boolean;
}
export interface ScreeningResult {
    searched: string;
    hits: SanctionsHit[];
    topHit: SanctionsHit | null;
    isSanctioned: boolean;
    isHighRisk: boolean;
    datasetsChecked: string[];
    screendAt: string;
    metadata: {
        latencyMs: number;
        serviceAvailable: boolean;
        retries: number;
    };
}
export declare function screenEntity(name: string, country?: string, schema?: 'Organization' | 'Person' | 'Vessel'): Promise<ScreeningResult>;
export declare function screenMultiple(entities: Array<{
    name: string;
    country?: string;
    role: string;
}>): Promise<Array<ScreeningResult & {
    role: string;
}>>;
