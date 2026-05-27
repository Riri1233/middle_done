export interface JwtPayload {
  sub: string;
  email: string;
  iat?: number;
  exp?: number;
}

export interface AuthUser {
  id: string;
  email: string;
}

export interface CheckFormData {
  cp: string;
  country: string;
  ctype?: string;
  reg?: string;
  product: string;
  tnved?: string;
  dual?: string;
  enduse?: string;
  ubo?: string;
  uboCountry?: string;
  ownership?: string;
  currency?: string;
  val?: string;
  bank?: string;
  payMethod?: string;
  transit?: string;
  vessel?: string;
  finalDest?: string;
}

export interface ModuleResult {
  risk: 'LOW' | 'MEDIUM' | 'HIGH';
  score: number;
  findings: string[];
}

export interface AnalysisResult {
  overall: 'LOW' | 'MEDIUM' | 'HIGH';
  score: number;
  verdict: 'APPROVED' | 'CAUTION' | 'BLOCKED';
  summary: string;
  red_flags: string[];
  norms: string[];
  modules: {
    sanctions: ModuleResult;
    exportControl: ModuleResult;
    ubo: ModuleResult;
    payment: ModuleResult;
    route: ModuleResult;
  };
  recs: string[];
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}
