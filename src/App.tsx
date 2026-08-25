import { useEffect, useState } from 'react'
import { Circle, Clock3, Expand, Moon, Snowflake, CloudRain, CloudLightning, Flame, Sparkles, Volume2, VolumeX } from 'lucide-react'
import './App.css'
import type { LayerKey, LayerState, Scene } from './types'
import { setPitchAudioMuted, unlockPitchAudio } from './audio/pitchAudio'
import { useIdleControls } from './hooks/useIdleControls'
import { FirefliesLayer } from './layers/FirefliesLayer'
import { GlobalMoon } from './layers/GlobalMoon'
import { StormLayer } from './layers/StormLayer'
import { EmberScene } from './scenes/EmberScene'
import { RainScene } from './scenes/RainScene'
import { SnowScene } from './scenes/SnowScene'
import { WorldBaseScene } from './scenes/WorldBaseScene'
import { saveWorld } from './world/worldState'
import { ClockDisplay } from './ui/ClockDisplay'

function App() {
  const [scene, setScene] = useState<Scene>('snow')
  const [showClock, setShowClock] = useState(false)
  const [soundOn, setSoundOn] = useState(true)
  const [layers, setLayers] = useState<LayerState>({ moon: true, storm: false, fireflies: false })
  const controlsVisible = useIdleControls()

  useEffect(() => {
    const id = window.setInterval(saveWorld, 4000)
    const persist = () => saveWorld()
    window.addEventListener('pagehide', persist)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('pagehide', persist)
      saveWorld()
    }
  }, [])

  const chooseScene = (nextScene: Scene) => {
    // This runs synchronously inside the user's click, satisfying browser audio policy
    // before any later animation frame needs meteor/thunder/fire audio.
    unlockPitchAudio()
    setScene(nextScene)
  }

  const toggleSound = () => {
    unlockPitchAudio()
    setSoundOn((value) => !value)
  }

  const toggleLayer = (layer: LayerKey) => {
    if (layer === 'storm') unlockPitchAudio()
    setLayers((value) => ({ ...value, [layer]: !value[layer] }))
  }

  useEffect(() => {
    setPitchAudioMuted(!soundOn)
  }, [soundOn])

  const goFullscreen = async () => {
    unlockPitchAudio()
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen()
      else await document.exitFullscreen()
    } catch {
      // Fullscreen support varies by browser; failure is harmless.
    }
  }

  return (
    <main
      className="pitchblack"
      data-scene={scene}
      data-layer-moon={layers.moon ? 'on' : 'off'}
      data-layer-storm={layers.storm ? 'on' : 'off'}
      data-layer-fireflies={layers.fireflies ? 'on' : 'off'}
    >
      <div className={`scene-layer ${scene === 'black' ? 'world-hidden' : ''}`}>
        <GlobalMoon visible={layers.moon} clouded={scene === 'ember'} />
        <WorldBaseScene scene={scene} />
        <SnowScene active={scene === 'snow'} soundOn={soundOn} speed={1} />
        <RainScene active={scene === 'rain'} soundOn={soundOn} speed={1} />
        <EmberScene
          active={scene === 'ember'}
          rainActive={scene === 'rain'}
          snowActive={scene === 'snow'}
          speed={1}
          soundOn={soundOn}
        />
        <FirefliesLayer active={layers.fireflies} />
        <StormLayer active={layers.storm} scene={scene} soundOn={soundOn} />
      </div>

      {showClock && <ClockDisplay awake={controlsVisible} />}

      <div className={`brand-whisper ${controlsVisible ? 'visible' : ''}`}>pitchblack</div>

      <nav className={`control-dock ${controlsVisible ? 'visible' : ''}`} aria-label="PitchBlack controls">
        <button className={scene === 'black' ? 'active' : ''} onClick={() => chooseScene('black')} aria-label="Black scene">
          <Circle size={17} strokeWidth={1.5} />
          <span>Black</span>
        </button>
        <button className={scene === 'snow' ? 'active' : ''} onClick={() => chooseScene('snow')} aria-label="Snow scene">
          <Snowflake size={17} strokeWidth={1.5} />
          <span>Snow</span>
        </button>
        <button className={scene === 'rain' ? 'active' : ''} onClick={() => chooseScene('rain')} aria-label="Rain scene">
          <CloudRain size={17} strokeWidth={1.5} />
          <span>Rain</span>
        </button>
        <button className={scene === 'ember' ? 'active' : ''} onClick={() => chooseScene('ember')} aria-label="Ember scene">
          <Flame size={17} strokeWidth={1.5} />
          <span>Ember</span>
        </button>
        <div className="dock-divider" />
        <button className={layers.moon ? 'active' : ''} onClick={() => toggleLayer('moon')} aria-label="Toggle moon">
          <Moon size={17} strokeWidth={1.5} />
          <span>Moon</span>
        </button>
        <button className={layers.storm ? 'active' : ''} onClick={() => toggleLayer('storm')} aria-label="Toggle storm layer">
          <CloudLightning size={17} strokeWidth={1.5} />
          <span>Storm</span>
        </button>
        <button className={layers.fireflies ? 'active' : ''} onClick={() => toggleLayer('fireflies')} aria-label="Toggle fireflies layer">
          <Sparkles size={17} strokeWidth={1.5} />
          <span>Fireflies</span>
        </button>
        <div className="dock-divider" />
        <button className={showClock ? 'active' : ''} onClick={() => setShowClock((value) => !value)} aria-label="Toggle clock">
          <Clock3 size={17} strokeWidth={1.5} />
          <span>Clock</span>
        </button>
        <button className={soundOn ? 'active' : ''} onClick={toggleSound} aria-label={soundOn ? 'Mute all sound' : 'Enable all sound'}>
          {soundOn ? <Volume2 size={17} strokeWidth={1.5} /> : <VolumeX size={17} strokeWidth={1.5} />}
          <span>{soundOn ? 'Sound' : 'Muted'}</span>
        </button>
        <button onClick={goFullscreen} aria-label="Toggle fullscreen">
          <Expand size={17} strokeWidth={1.5} />
          <span>Full</span>
        </button>
      </nav>

      <div className={`hint ${controlsVisible ? 'visible' : ''}`}>move or tap to wake controls</div>
    </main>
  )
}

export default App
