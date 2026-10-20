declare module "fifa-name-generator" {
  export function generateNameSplit(
    nationality: string,
    secondaryNationality?: string | null
  ): { firstName: string; lastName: string };
}
