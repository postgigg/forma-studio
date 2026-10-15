import { createRoot } from "react-dom/client";
import App from "./App";
import { BrandProvider } from "./BrandContext";
import { DesignStyleProvider } from "./DesignStyle";
import "./styles.css";
createRoot(document.getElementById("root")!).render(
  <BrandProvider>
    <DesignStyleProvider><App /></DesignStyleProvider>
  </BrandProvider>,
);
