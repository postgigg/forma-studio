export interface DesignIntent { outcome: string; message: string; preserve: string; avoid: string }
export const intentLimits: Record<keyof DesignIntent, number>;
export function validateDesignIntent(value: unknown): DesignIntent | undefined;
