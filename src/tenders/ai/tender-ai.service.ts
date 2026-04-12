import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import {
  TenderType,
  TenderSector,
} from '../dto/create-tender.dto';

export interface ClassificationResult {
  type: TenderType;
  sector: TenderSector;
  summary: string;
  tags: string[];
  priorityScore: number; // 0..1
}

@Injectable()
export class TenderAiService {
  private readonly logger = new Logger(TenderAiService.name);
  private client: Anthropic | null = null;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey) {
      this.client = new Anthropic({
        apiKey,
        defaultHeaders: {
          'anthropic-beta': 'prompt-caching-2024-07-31',
        },
      });
      this.logger.log('Tender AI service initialized with Anthropic SDK');
    } else {
      this.logger.warn(
        'ANTHROPIC_API_KEY not set — AI classification disabled. Will fall back to heuristic classification.',
      );
    }
  }

  isEnabled(): boolean {
    return this.client !== null;
  }

  /**
   * Classify a tender using Claude. Falls back to heuristic if API is
   * unavailable or any error occurs.
   */
  async classify(
    title: string,
    description: string | undefined,
  ): Promise<ClassificationResult> {
    if (!this.client) {
      return this.heuristicFallback(title, description);
    }

    try {
      const prompt = this.buildPrompt(title, description);
      const response = await this.client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        system: [
          {
            type: 'text',
            text: this.systemPrompt(),
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: [{ role: 'user', content: prompt }],
      });

      const text = this.extractText(response);
      return this.parseResponse(text, title, description);
    } catch (err: any) {
      this.logger.error(`AI classification failed: ${err.message}`);
      return this.heuristicFallback(title, description);
    }
  }

  /**
   * Batch classify multiple tenders. Useful for scraper backfills.
   * Calls are made sequentially to avoid hitting rate limits.
   */
  async classifyBatch(
    items: { title: string; description?: string }[],
  ): Promise<ClassificationResult[]> {
    const results: ClassificationResult[] = [];
    for (const item of items) {
      results.push(await this.classify(item.title, item.description));
    }
    return results;
  }

  // -------------- Prompt construction --------------

  private systemPrompt(): string {
    return `You are an expert tender analyst for the Afghanistan Ministry of Mines and Petroleum (MoMP). Your job is to classify tender notices into a structured JSON format.

You MUST respond with ONLY a valid JSON object — no markdown, no commentary, no code fences.

The JSON object MUST have these exact keys:
{
  "type": "TENDER" | "CONSULTING" | "AUCTION" | "NOTICE" | "ANNOUNCEMENT" | "OTHER",
  "sector": "MINING" | "OIL" | "GAS" | "CONSULTING" | "OTHER",
  "summary": string (1-2 sentences in plain English, max 200 chars),
  "tags": string[] (3-6 short tags like "high-value", "urgent", "consultancy", "exploration", "feasibility"),
  "priorityScore": number (0.0 to 1.0, where 1.0 = highest priority)
}

Type meanings:
- TENDER: standard procurement tender notice with bidding
- CONSULTING: expressions of interest, consultancy services, expert hire
- AUCTION: mineral/asset auction (e.g., emerald auction)
- NOTICE: a generic public notice (not an announcement, not a bid)
- ANNOUNCEMENT: official ministry announcement, award notification, accreditation invitation, public information release
- OTHER: anything else

Sector meanings:
- MINING: minerals (emerald, gold, copper, coal, etc.)
- OIL: petroleum, oil exploration, oil services
- GAS: natural gas, TAPI gas pipeline, gas infrastructure
- CONSULTING: pure consultancy without sector specialization
- OTHER: anything else

Priority scoring guidelines:
- 0.9-1.0: oil/gas mega-projects, high-value with deadlines under 14 days
- 0.7-0.9: high-value mining or consulting with reasonable deadlines
- 0.5-0.7: standard tenders with normal deadlines
- 0.3-0.5: low-priority notices
- 0.0-0.3: closed, expired, or irrelevant

Do not include any other keys. Do not wrap in markdown.`;
  }

  private buildPrompt(title: string, description?: string): string {
    return `Classify the following tender:

TITLE: ${title}

DESCRIPTION: ${description || '(no description available)'}

Respond with the JSON object only.`;
  }

  // -------------- Response parsing --------------

  private extractText(response: Anthropic.Messages.Message): string {
    const block = response.content[0];
    if (block.type === 'text') return block.text;
    return '';
  }

  private parseResponse(
    text: string,
    title: string,
    description?: string,
  ): ClassificationResult {
    try {
      // Strip any markdown code fences if Claude added them
      const cleaned = text
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```\s*$/i, '')
        .trim();
      const parsed = JSON.parse(cleaned);

      return {
        type: this.coerceType(parsed.type),
        sector: this.coerceSector(parsed.sector),
        summary: typeof parsed.summary === 'string' ? parsed.summary.slice(0, 500) : '',
        tags: Array.isArray(parsed.tags)
          ? parsed.tags.filter((t: any) => typeof t === 'string').slice(0, 10)
          : [],
        priorityScore: this.coerceScore(parsed.priorityScore),
      };
    } catch (err: any) {
      this.logger.warn(
        `Failed to parse AI response, falling back to heuristic: ${err.message}`,
      );
      return this.heuristicFallback(title, description);
    }
  }

  private coerceType(value: any): TenderType {
    const valid = Object.values(TenderType);
    if (typeof value === 'string' && valid.includes(value as TenderType)) {
      return value as TenderType;
    }
    return TenderType.OTHER;
  }

  private coerceSector(value: any): TenderSector {
    const valid = Object.values(TenderSector);
    if (typeof value === 'string' && valid.includes(value as TenderSector)) {
      return value as TenderSector;
    }
    return TenderSector.OTHER;
  }

  private coerceScore(value: any): number {
    const num = Number(value);
    if (isNaN(num)) return 0.5;
    return Math.max(0, Math.min(1, num));
  }

  // -------------- Heuristic fallback --------------

  /**
   * Used when the AI is disabled or fails. Same logic as the scraper's
   * built-in classifier, plus a basic priority score.
   */
  private heuristicFallback(
    title: string,
    description?: string,
  ): ClassificationResult {
    const text = `${title} ${description || ''}`.toLowerCase();

    let type = TenderType.OTHER;
    if (text.includes('expression of interest') || text.includes('eoi'))
      type = TenderType.CONSULTING;
    else if (text.includes('consultanc') || text.includes('consultant'))
      type = TenderType.CONSULTING;
    else if (text.includes('auction')) type = TenderType.AUCTION;
    else if (
      text.includes('notification of intention to award') ||
      text.includes('invitation to apply') ||
      text.includes('accreditation') ||
      text.includes('announcement') ||
      text.includes('award')
    )
      type = TenderType.ANNOUNCEMENT;
    else if (text.includes('notice')) type = TenderType.NOTICE;
    else if (text.includes('tender')) type = TenderType.TENDER;

    let sector = TenderSector.OTHER;
    if (text.includes('oil')) sector = TenderSector.OIL;
    else if (text.includes('gas') || text.includes('tapi'))
      sector = TenderSector.GAS;
    else if (
      text.includes('mine') ||
      text.includes('mining') ||
      text.includes('emerald') ||
      text.includes('gold') ||
      text.includes('copper') ||
      text.includes('coal')
    )
      sector = TenderSector.MINING;
    else if (text.includes('consult')) sector = TenderSector.CONSULTING;

    // Basic priority: oil/gas > mining > others
    let score = 0.4;
    if (sector === TenderSector.OIL || sector === TenderSector.GAS)
      score += 0.3;
    else if (sector === TenderSector.MINING) score += 0.2;
    if (type === TenderType.CONSULTING) score += 0.1;

    return {
      type,
      sector,
      summary: title.slice(0, 200),
      tags: [],
      priorityScore: Math.min(1, score),
    };
  }
}
