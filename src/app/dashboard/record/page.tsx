import { Suspense } from "react";
import RecordClient from "./record-client";

// The recorder reads ?cours=<id> to file the séance it is about to capture.
// useSearchParams needs a Suspense boundary for this route to stay
// prerendered; without one the whole page would be rendered on demand.
export default function RecordPage() {
  return (
    <Suspense>
      <RecordClient />
    </Suspense>
  );
}
