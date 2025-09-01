import React from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import AppLayout from "./components/AppLayout";
import "./App.css";
import MarkdownViewerNew from "./components/MarkdownViewerNew";

const App: React.FC = () => {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<AppLayout />}>
          <Route index element={<MarkdownViewerNew />} />
          <Route path="docs/*" element={<MarkdownViewerNew />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Router>
  );
};

export default App;
