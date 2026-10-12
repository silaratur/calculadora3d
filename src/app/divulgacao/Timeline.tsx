"use client";

import { useMemo, useState } from "react";

type Kind = "CAROUSEL" | "IMAGE" | "STORY" | "REEL";
type Status = "DRAFT" | "APPROVED" | "REJECTED" | "PUBLISHING" | "PUBLISHED" | "FAILED";
export type TimelinePost = { id: string; title: string; kind: Kind; status: Status; scheduledAt: string | null; publishedAt: string | null };

const KIND_LABEL: Record<Kind, string> = { CAROUSEL: "Carrossel", IMAGE: "Post", STORY: "Story", REEL: "Reel" };
const KIND_COLOR: Record<Kind, string> = { CAROUSEL: "#777f5d", IMAGE: "#8a5a2e", STORY: "#602f32", REEL: "#4c6b7a" };
const STATUS_LABEL: Record<Status, string> = { DRAFT: "rascunho", APPROVED: "agendado", REJECTED: "reprovado", PUBLISHING: "publicando", PUBLISHED: "publicado", FAILED: "com erro" };
const FEED: Kind[] = ["CAROUSEL", "IMAGE", "REEL"];
const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

const pad = (n: number) => String(n).padStart(2, "0");
const dayKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const whenOf = (post: TimelinePost) => post.status === "PUBLISHED" ? post.publishedAt ?? post.scheduledAt : post.scheduledAt;

/** Conflitos do dia: mais de um post no feed, mais de um story ou dois posts no mesmo horário. */
export function dayConflicts(items: TimelinePost[]) {
  const live = items.filter((post) => post.status !== "REJECTED");
  const problems: string[] = [];
  const feed = live.filter((post) => FEED.includes(post.kind)).length;
  const stories = live.filter((post) => post.kind === "STORY").length;
  if (feed > 1) problems.push(`${feed} posts no feed no mesmo dia`);
  if (stories > 1) problems.push(`${stories} stories no mesmo dia`);
  const hours = new Map<string, number>();
  for (const post of live) {
    const date = new Date(whenOf(post)!);
    const key = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
    hours.set(key, (hours.get(key) ?? 0) + 1);
  }
  for (const [hour, count] of hours) if (count > 1) problems.push(`${count} publicações às ${hour}`);
  return problems;
}

/**
 * Linha do tempo da Divulgação: semanas a partir de hoje (e a anterior, para
 * conferir o que saiu), cada dia com as publicações na ordem do horário.
 */
export function Timeline({ posts, onOpen }: { posts: TimelinePost[]; onOpen: (post: TimelinePost) => void }) {
  const [weeks, setWeeks] = useState(5);
  const [today] = useState(() => new Date());
  const { days, byDay, unscheduled } = useMemo(() => {
    const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7) - 7);
    const list = Array.from({ length: (weeks + 1) * 7 }, (_, i) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i));
    const map = new Map<string, TimelinePost[]>();
    for (const post of posts) {
      const when = whenOf(post);
      if (!when) continue;
      const key = dayKey(new Date(when));
      map.set(key, [...(map.get(key) ?? []), post]);
    }
    for (const items of map.values()) items.sort((a, b) => whenOf(a)!.localeCompare(whenOf(b)!));
    return { days: list, byDay: map, unscheduled: posts.filter((post) => !whenOf(post) && post.status !== "PUBLISHED") };
  }, [posts, weeks, today]);

  const todayKey = dayKey(today);
  const alerts = days
    .filter((day) => dayKey(day) >= todayKey)
    .map((day) => ({ day, problems: dayConflicts(byDay.get(dayKey(day)) ?? []) }))
    .filter((item) => item.problems.length);

  return (
    <section className="postcal" aria-label="Linha do tempo das publicações">
      {alerts.length ? (
        <div className="postcal-alert" role="alert">
          <strong>Atenção: {alerts.length === 1 ? "1 dia com publicações demais" : `${alerts.length} dias com publicações demais`}</strong>
          <ul>
            {alerts.map(({ day, problems }) => (
              <li key={dayKey(day)}>{day.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })}: {problems.join(" · ")}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="postcal-legend">
        {(Object.keys(KIND_LABEL) as Kind[]).map((kind) => <span key={kind}><i style={{ background: KIND_COLOR[kind] }} />{KIND_LABEL[kind]}</span>)}
        <span className="postcal-legend-status"><b className="status-approved" /> agendado <b className="status-draft" /> rascunho <b className="status-published" /> publicado</span>
      </div>
      <div className="postcal-grid">
        {WEEKDAYS.map((name) => <div key={name} className="postcal-weekday">{name}</div>)}
        {days.map((day) => {
          const key = dayKey(day);
          const items = byDay.get(key) ?? [];
          const problems = key >= todayKey ? dayConflicts(items) : [];
          const past = key < todayKey;
          return (
            <div key={key} className={`postcal-day${past ? " past" : ""}${key === todayKey ? " today" : ""}${problems.length ? " conflict" : ""}${!items.length ? " empty" : ""}`}>
              <div className="postcal-date">
                <span className="postcal-date-week">{day.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "")}</span>
                <strong>{day.getDate()}</strong>
                {day.getDate() === 1 || key === dayKey(days[0]) ? <span>{day.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")}</span> : null}
                {key === todayKey ? <em>hoje</em> : null}
                {problems.length ? <em className="warn" title={problems.join(" · ")}>⚠ {problems.length}</em> : null}
              </div>
              {items.map((post) => {
                const date = new Date(whenOf(post)!);
                return (
                  <button key={post.id} type="button" className={`postcal-item status-${post.status.toLowerCase()}`} style={{ borderLeftColor: KIND_COLOR[post.kind] }} onClick={() => onOpen(post)} title={`${KIND_LABEL[post.kind]} · ${post.title} · ${STATUS_LABEL[post.status]}`}>
                    <span className="postcal-time">{pad(date.getHours())}:{pad(date.getMinutes())}</span>
                    <span className="postcal-kind" style={{ color: KIND_COLOR[post.kind] }}>{KIND_LABEL[post.kind]}</span>
                    <span className="postcal-title">{post.title}</span>
                    <span className="postcal-status">{STATUS_LABEL[post.status]}</span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
      <div className="postcal-footer">
        {unscheduled.length ? <span>{unscheduled.length} {unscheduled.length === 1 ? "post sem data" : "posts sem data"} — veja na lista.</span> : <span />}
        <button type="button" className="mini-button ghost" onClick={() => setWeeks((current) => current + 4)}>Ver mais 4 semanas</button>
      </div>
    </section>
  );
}
