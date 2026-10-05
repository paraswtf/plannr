import { type Metadata } from "next";

import { PresenterApp } from "../deck-app";

export const metadata: Metadata = {
  title: "Presenter view — Plannr",
};

export default function PresenterPage() {
  return <PresenterApp />;
}
