import { createRoot } from "react-dom/client";
import App from "./App";
import { BrandProvider } from "./BrandContext";
import { DesignStyleProvider } from "./DesignStyle";
import "./styles.css";
if (new URLSearchParams(location.search).get('forma-render') === '1') {
  void import('./render-mode');
} else createRoot(document.getElementById("root")!).render(
  <BrandProvider>
    <DesignStyleProvider><App /></DesignStyleProvider>
  </BrandProvider>,
);
