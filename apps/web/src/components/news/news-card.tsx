"use client";

import { recordNewsEngagement } from "@goal-app/api-client";
import type { NewsArticle, NewsCategory } from "@goal-app/contracts";
import {
  Brain as BrainCircuit,
  NavArrowDown as ChevronDown,
  OpenNewWindow as ExternalLink,
} from "iconoir-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

export const NEWS_IMAGES = [
  "https://lh3.googleusercontent.com/aida-public/AB6AXuBHT1lW5scY9j-p0k7k3v4YNJ8iSMFqdQ8QwUnyDcDgvADPG55qEpVmnsUwtpc57NQ4SOULv8D-avLC_MV58g1GjL8f9BHK90SQ8TlTYkbzTW3GbvsBJl9ewUtUZ2mi1JMi_GaW2gfK2qdByuSiqzS4dPnc3bN8S5RLYa4paEj2eD8dfhzImMWwKOKvKuNCTdhQVLTpIZr6VPO_HNAoqv5avxg56mxSVBWyy_KShWA_Ks-mxhKlY4SBIA",
  "https://lh3.googleusercontent.com/aida-public/AB6AXuCniT5ZKurjRsIST62rQ5mELruzhz7ov4yl5pHwZoH76wNmT9o4fXO-q_gH1k9nwH7XndPU_tSKFCidwfzxO8jEqyi_wLvte7DJTYAPkQKPf1D42lIZAbqawT_2y_dF4ZTgjVjNNbCPnEMMNDn55j5n_Gc90UZdfAG1IZFXDZi3Zu7oyq37baE-Nu1XnlSFrL2uWEuuawQcfPnbrLjqOaJdqt2_O2IVjhNeMNO28P7wNKDKQNiAofMZ9Q",
  "https://lh3.googleusercontent.com/aida-public/AB6AXuDMO_qtEvpCo56hXEOXplu1KG3Fgg6ymy5P80M8haodhd02DRnfnFnV_cK4QYiYcAtSP8T1vUYqidCQMsE2F9_23tfqZ_Luynk8PiyyFjTkBWxZjk9F1nNtSEtk1K0isTyJCFZU_IoPcLYLmM-bpKBNWgVZ8ZkI3lgxvE43Cr9HEPQOmSno10lsDJkfatYOnCIUJvITMkdG3nzVuQGPlygrwpyXezSiBra0TgYIj_EelTDNNk7Yqvq_qQ",
] as const;

export const newsCategoryLabels: Record<NewsCategory, string> = {
  breaking: "Breaking",
  general: "Football",
  injury: "Injury Update",
  interview: "Interview",
  lineup: "Lineup",
  match: "Match Analysis",
  transfer: "Transfer",
};

export function recordNewsOpen(articleId: string, signedIn: boolean) {
  if (signedIn) void recordNewsEngagement(articleId).catch(() => undefined);
}

function formatNewsDate(value: string) {
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Bangkok",
    year: "2-digit",
  }).format(new Date(value));
}

export function NewsCard({
  article,
  imageIndex = 1,
  reasons = [],
  signedIn = false,
}: {
  article: NewsArticle;
  imageIndex?: number;
  reasons?: string[];
  signedIn?: boolean;
}) {
  return (
    <Card className="group flex h-full min-h-[30rem] flex-col overflow-hidden">
      <a
        aria-label={`อ่านข่าว: ${article.headline}`}
        className="block h-48 overflow-hidden"
        href={article.primaryUrl}
        onClick={() => recordNewsOpen(article.id, signedIn)}
        rel="noopener noreferrer"
        target="_blank"
      >
        <div
          aria-hidden="true"
          className="h-full bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
          style={{ backgroundImage: `url('${NEWS_IMAGES[imageIndex % NEWS_IMAGES.length]}')` }}
        />
      </a>
      <CardContent className="flex flex-1 flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <span className="font-label text-[0.65rem] font-bold tracking-[0.12em] text-primary uppercase">
            {newsCategoryLabels[article.category]}
          </span>
          <time
            className="shrink-0 font-label text-[0.65rem] text-muted-foreground uppercase"
            dateTime={article.discoveredAt}
          >
            {formatNewsDate(article.discoveredAt)}
          </time>
        </div>
        <h2 className="font-headline text-2xl leading-tight tracking-[0.03em] uppercase transition-colors group-hover:text-primary">
          <a
            href={article.primaryUrl}
            onClick={() => recordNewsOpen(article.id, signedIn)}
            rel="noopener noreferrer"
            target="_blank"
          >
            {article.headline}
          </a>
        </h2>
        <p className="line-clamp-3 text-sm leading-6 text-muted-foreground">{article.summary}</p>
        {reasons.length > 0 ? (
          <p className="font-label text-[0.65rem] leading-5 text-primary">{reasons.join(" · ")}</p>
        ) : null}

        <Collapsible className="group goal-news-ai-glow mt-auto border border-white/10 bg-background/80 p-3">
          <CollapsibleTrigger asChild>
            <Button
              className="h-auto w-full justify-between p-0 text-[0.65rem] tracking-[0.12em] hover:bg-transparent"
              variant="ghost"
            >
              <span className="flex items-center gap-2">
                <BrainCircuit className="size-4" /> TL;DR by AI
              </span>
              <ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="data-[state=closed]:hidden" forceMount>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-6 text-foreground-warm">
              {article.summaryBullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
            <div className="mt-4 border-t border-border pt-3">
              <p className="font-label text-[0.6rem] tracking-[0.12em] text-muted-foreground uppercase">
                แหล่งข่าว
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {article.sources.map((source) => (
                  <Button asChild key={source.url} size="xs" variant="outline">
                    <a
                      href={source.url}
                      onClick={() => recordNewsOpen(article.id, signedIn)}
                      rel="noopener noreferrer"
                      target="_blank"
                      title={source.title}
                    >
                      {source.domain} <ExternalLink className="size-3" />
                    </a>
                  </Button>
                ))}
              </div>
              <p className="mt-3 text-xs leading-5 text-muted-foreground">
                สรุปโดย AI จากแหล่งข่าวที่ระบุ โปรดตรวจสอบต้นฉบับก่อนตัดสินใจ
              </p>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
