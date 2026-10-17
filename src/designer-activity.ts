import { useEffect, useState } from "react";
import { designerRequest, DesignerRequestError, type DesignJob } from "./ai";

// Views already poll their jobs. Only read a small status summary when a view
// stops doing so, keeping the rail indicator alive without resubmitting work.
export function useDesignerActivity() {
  const [activity, setActivity] = useState({ count: 0, stage: "" });
  useEffect(() => {
    const jobs = new Map<string, { seen: number; active: boolean; stage: string }>();
    let stopped = false, polling = false, token: string | undefined;
    try {
      const id = sessionStorage.getItem("forma:ai-job");
      if (id) jobs.set(id, { seen: 0, active: false, stage: "" });
    } catch { /* Storage is optional for an activity indicator. */ }
    const update = () => {
      if (stopped) return;
      const active = [...jobs.values()].filter(job => job.active);
      setActivity({ count: active.length, stage: active[0]?.stage || "" });
    };
    const receive = (event: Event) => {
      const job = (event as CustomEvent<Pick<DesignJob, "id" | "status" | "stage">>).detail;
      if (!job?.id) return;
      if (["queued", "running"].includes(job.status))
        jobs.set(job.id, { seen: Date.now(), active: true, stage: job.stage });
      else jobs.delete(job.id);
      update();
    };
    const poll = async () => {
      if (polling || stopped) return;
      const stale = [...jobs].filter(([, job]) => Date.now() - job.seen > 3000);
      if (!stale.length) return;
      polling = true;
      try {
        token ||= (await designerRequest("/session")).token;
        for (const [id] of stale) {
          if (stopped || !jobs.has(id)) continue;
          try { await designerRequest(`/jobs/${encodeURIComponent(id)}?summary=1`, token); }
          catch (error) {
            if (error instanceof DesignerRequestError && error.status === 404) {
              jobs.delete(id);
              update();
            } else if (error instanceof DesignerRequestError && error.status === 403) token = undefined;
          }
        }
      } catch { /* Retain known activity during a temporary disconnection. */ }
      finally { polling = false; }
    };
    window.addEventListener("forma:designer-activity", receive);
    const timer = window.setInterval(() => void poll(), 1500);
    void poll();
    return () => {
      stopped = true;
      clearInterval(timer);
      window.removeEventListener("forma:designer-activity", receive);
    };
  }, []);
  return activity;
}
