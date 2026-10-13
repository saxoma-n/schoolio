import { HashRouter, Route, Routes } from 'react-router-dom'

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="*" element={<h1>Log in</h1>} />
      </Routes>
    </HashRouter>
  )
}
