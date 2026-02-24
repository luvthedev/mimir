import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Portal } from './pages/Portal';
import { Studio } from './pages/Studio';
import { Login } from './pages/Login';
import { ProtectedRoute } from './components/ProtectedRoute';
import { WorkflowEditor } from './components/workflow/WorkflowEditor';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Login page */}
        <Route path="/login" element={<Login />} />
        
        {/* Redirect root to portal */}
        <Route path="/" element={<Navigate to="/portal" replace />} />
        
        {/* Portal landing page - protected */}
        <Route path="/portal" element={
          <ProtectedRoute>
            <Portal />
          </ProtectedRoute>
        } />
        
        {/* Studio task planning interface - protected */}
        <Route path="/studio" element={
          <ProtectedRoute>
            <Studio />
          </ProtectedRoute>
        } />

        {/* Workflow visual editor - protected */}
        <Route path="/workflow" element={
          <ProtectedRoute>
            <WorkflowEditor />
          </ProtectedRoute>
        } />

        {/* Catch-all redirect to portal */}
        <Route path="*" element={<Navigate to="/portal" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
