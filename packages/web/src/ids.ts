/** Identificativi di gioco (copia leggera di @business-game/config, che dipende da Node). */
export const CLASS_IDS = ['employee', 'freelancer', 'entrepreneur', 'investor'] as const;
export const SECTOR_IDS = [
  'energy',
  'raw_materials',
  'manufacturing',
  'construction',
  'logistics',
  'technology',
  'retail',
  'food_service',
  'finance',
] as const;
export const SKILL_IDS = [
  'technical',
  'commercial',
  'legal',
  'accounting_tax',
  'finance',
  'management',
] as const;
export const EMPLOYEE_ROLES = ['operations', 'technical', 'sales', 'administration'] as const;
export const FREELANCER_ROLES = ['legal', 'tax', 'marketing', 'engineering', 'finance'] as const;
export const FOUNDABLE_FORMS = ['sole_proprietorship', 'srl'] as const;
