import { RouterProvider } from "@tanstack/react-router";
import React, { startTransition } from "react";
import { createRoot } from "react-dom/client";
import { getRouter } from "./router";
import "./styles.css";

const router = getRouter();
const root = createRoot(document);

startTransition(() => {
  root.render(
    <React.StrictMode>
      <RouterProvider router={router} />
    </React.StrictMode>,
  );
});
