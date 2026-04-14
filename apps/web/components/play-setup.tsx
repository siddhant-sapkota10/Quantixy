"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/button";
import { Dropdown } from "@/components/dropdown";
import { useSupabaseAuth } from "@/lib/auth";
import {
  DIFFICULTIES,
  type Difficulty,
  TOPICS,
  type Topic,
  formatTopicLabel
} from "@/lib/topics";

const topicOptions = TOPICS.map((topic) => ({
  label: formatTopicLabel(topic),
  value: topic
}));

const difficultyOptions = DIFFICULTIES.map((difficulty) => ({
  label: difficulty.charAt(0).toUpperCase() + difficulty.slice(1),
  value: difficulty
}));

export function PlaySetup() {
  const router = useRouter();
  const { user, loading } = useSupabaseAuth();
  const [selectedTopic, setSelectedTopic] = useState<Topic>("arithmetic");
  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty>("easy");

  useEffect(() => {
    if (!loading && !user) {
      router.push("/");
    }
  }, [loading, router, user]);

  const handleStart = () => {
    const params = new URLSearchParams({
      topic: selectedTopic,
      difficulty: selectedDifficulty
    });
    router.push(`/game?${params.toString()}`);
  };

  return (
    <section className="w-full max-w-2xl rounded-[2rem] border border-white/10 bg-slate-950/70 p-8 shadow-glow backdrop-blur md:p-12">
      <div className="space-y-4 text-center">
        <span className="inline-flex rounded-full border border-sky-400/30 bg-sky-400/10 px-4 py-1 text-xs font-medium uppercase tracking-[0.3em] text-sky-200">
          Match Setup
        </span>
        <h1 className="text-4xl font-black tracking-tight text-white md:text-5xl">
          Choose Your Topic
        </h1>
        <p className="text-lg text-slate-300">
          Pick the kind of math battle you want to jump into.
        </p>
      </div>

      <div className="mt-10 space-y-4">
        <label className="block space-y-2 text-left">
          <span className="text-sm font-medium uppercase tracking-[0.2em] text-slate-400">
            Select Topic
          </span>
          <Dropdown
            aria-label="Select a math topic"
            value={selectedTopic}
            onChange={(event) => setSelectedTopic(event.target.value as Topic)}
            options={topicOptions}
          />
        </label>

        <label className="block space-y-2 text-left">
          <span className="text-sm font-medium uppercase tracking-[0.2em] text-slate-400">
            Select Difficulty
          </span>
          <Dropdown
            aria-label="Select a difficulty"
            value={selectedDifficulty}
            onChange={(event) => setSelectedDifficulty(event.target.value as Difficulty)}
            options={difficultyOptions}
          />
        </label>

        <Button
          className="w-full py-4 text-lg font-bold shadow-lg shadow-sky-500/20"
          onClick={handleStart}
          disabled={loading || !user}
        >
          Enter Queue
        </Button>

        <Button
          variant="secondary"
          className="w-full"
          onClick={() => router.push("/")}
        >
          Back
        </Button>
      </div>
    </section>
  );
}
