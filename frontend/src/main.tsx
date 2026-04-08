import React, { useState } from 'react'
import ReactDOM from 'react-dom/client'
import HomePage from './components/HomePage'
import QuizFlowManager from './components/QuizFlowManager'

function App() {
  const [started, setStarted] = useState(false)
  const [flowOpen, setFlowOpen] = useState(false)

  const userId = 'demo-user'
  const sessionId = 'demo-session'

  const handleStart = () => {
    setStarted(true)
    setFlowOpen(true)
  }

  const handleClose = () => {
    setFlowOpen(false)
    setStarted(false)
  }

  return (
    <>
      {/* Landing page is always rendered as the background */}
      <HomePage onStart={handleStart} />

      {/* Assessment + Roadmap flow opens on top when user clicks Start */}
      {started && (
        <QuizFlowManager
          open={flowOpen}
          onClose={handleClose}
          userId={userId}
          sessionId={sessionId}
        />
      )}
    </>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
