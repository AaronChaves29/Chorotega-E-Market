"use client";

import { useEffect, useState } from "react";
import { scheduleSearch } from "@/lib/search-delay";

export function useDebouncedSearch(value: string) {
  const text = value.trim();
  const [term, setTerm] = useState(text);
  useEffect(() => {
    if (text === term) return;
    return scheduleSearch(() => setTerm(text));
  }, [text, term]);
  return { term, pending: text !== term };
}
