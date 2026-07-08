export interface IQuestionSuggestionService {
  handleChannelMessage(channelId: string, authorId: string, text: string): Promise<void>;
}
