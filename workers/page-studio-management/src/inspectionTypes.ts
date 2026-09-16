export type InspectionQuery = <T>(sql: string, params: unknown[]) => Promise<T | null>
export const inspectionError = (input: { statusCode: number, statusMessage: string }) => Object.assign(new Error(input.statusMessage), input)
