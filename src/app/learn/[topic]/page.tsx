import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TOPICS, topicBySlug } from "@/ui/learn/topics";
import { LearnClient } from "../learn-client";

// /learn/<slug>: one topic's lessons and example programs. Unknown topics are a 404.
export const dynamicParams = false;
export const generateStaticParams = () => TOPICS.map((t) => ({ topic: t.slug }));

export async function generateMetadata({ params }: { params: Promise<{ topic: string }> }): Promise<Metadata> {
  const t = topicBySlug((await params).topic);
  return t ? { title: `${t.title} · Learn`, description: t.short } : {};
}

export default async function TopicRoute({ params }: { params: Promise<{ topic: string }> }) {
  const t = topicBySlug((await params).topic);
  if (!t) notFound();
  return <LearnClient topic={t.slug} />;
}
