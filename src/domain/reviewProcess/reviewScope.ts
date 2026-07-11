/**
 * Which kind of periodic knowledge-retention review an interview covers (SA-20).
 * Mirrors backend's MonthlyReviewProcess/AnnualReviewProcess distinction (BE-22).
 */
export type ReviewScope = 'monthly' | 'annual';
