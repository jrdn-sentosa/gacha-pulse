"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PullIntro } from "@/components/pull/pull-intro";

export default function Home() {
  const router = useRouter();
  const [showPull, setShowPull] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem("pullComplete")) {
      router.replace("/dashboard");
    } else {
      setShowPull(true);
    }
  }, [router]);

  if (!showPull) return null;
  return <PullIntro />;
}
