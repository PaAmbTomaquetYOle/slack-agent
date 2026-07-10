export interface IExpertRecommendationService {
  findExperts(channelId: string, userId: string, topic: string): Promise<void>;
}
