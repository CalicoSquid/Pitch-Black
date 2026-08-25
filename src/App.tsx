import { useEffect, useState } from 'react'
import { Circle, Clock3, Expand, Moon, Snowflake, CloudRain, CloudLightning, Flame, Sparkles, Volume2, VolumeX } from 'lucide-react'
import './App.css'
import type { LayerKey, LayerState, Scene } from './types'
import { setPitchAudioMuted, suspendPitchAudio, unlockPitchAudio } from './audio/pitchAudio'
import { useIdleControls } from './hooks/useIdleControls'
import { FirefliesLayer } from './layers/FirefliesLayer'
import { GlobalMoon } from './layers/GlobalMoon'
import { StormLayer } from './layers/StormLayer'
import { EmberScene } from './scenes/EmberScene'
import { RainScene } from './scenes/RainScene'
import { SnowScene } from './scenes/SnowScene'
import { WorldBaseScene } from './scenes/WorldBaseScene'
import { resetWorld, saveWorld } from './world/worldState'
import { ClockDisplay } from './ui/ClockDisplay'

type PitchPreferences = {
  scene: Scene
  showClock: boolean
  soundOn: boolean
  layers: LayerState
}

const PREFERENCES_STORAGE_KEY = 'pitchblack-preferences-v1'
const DEFAULT_PREFERENCES: PitchPreferences = {
  scene: 'black',
  showClock: true,
  soundOn: false,
  layers: { moon: true, storm: false, fireflies: false },
}

function loadPreferences(): PitchPreferences {
  if (typeof window === 'undefined') return DEFAULT_PREFERENCES

  try {
    const raw = window.localStorage.getItem(PREFERENCES_STORAGE_KEY)
    if (!raw) return DEFAULT_PREFERENCES
    const saved = JSON.parse(raw) as Partial<PitchPreferences>
    const validScene: Scene =
      saved.scene === 'black' || saved.scene === 'snow' || saved.scene === 'rain' || saved.scene === 'ember'
        ? saved.scene
        : DEFAULT_PREFERENCES.scene

    return {
      scene: validScene,
      showClock: typeof saved.showClock === 'boolean' ? saved.showClock : DEFAULT_PREFERENCES.showClock,
      soundOn: typeof saved.soundOn === 'boolean' ? saved.soundOn : DEFAULT_PREFERENCES.soundOn,
      layers: {
        moon: typeof saved.layers?.moon === 'boolean' ? saved.layers.moon : DEFAULT_PREFERENCES.layers.moon,
        storm: typeof saved.layers?.storm === 'boolean' ? saved.layers.storm : DEFAULT_PREFERENCES.layers.storm,
        fireflies: typeof saved.layers?.fireflies === 'boolean' ? saved.layers.fireflies : DEFAULT_PREFERENCES.layers.fireflies,
      },
    }
  } catch {
    return DEFAULT_PREFERENCES
  }
}

function App() {
  const [initialPreferences] = useState(loadPreferences)
  const [scene, setScene] = useState<Scene>(initialPreferences.scene)
  const [showClock, setShowClock] = useState(initialPreferences.showClock)
  const [soundOn, setSoundOn] = useState(initialPreferences.soundOn)
  const [layers, setLayers] = useState<LayerState>(initialPreferences.layers)
  const [showUtilities, setShowUtilities] = useState(false)
  const controlsVisible = useIdleControls()

  useEffect(() => {
    const id = window.setInterval(saveWorld, 15000)
    const persist = () => saveWorld()
    const persistWhenHidden = () => {
      if (document.visibilityState === 'hidden') saveWorld()
    }

    window.addEventListener('pagehide', persist)
    document.addEventListener('visibilitychange', persistWhenHidden)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('pagehide', persist)
      document.removeEventListener('visibilitychange', persistWhenHidden)
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

  useEffect(() => {
    if (!controlsVisible) setShowUtilities(false)
  }, [controlsVisible])

  useEffect(() => {
    // A hidden/backgrounded page should never keep sounding. Resume is attempted
    // when the page becomes visible again, while the gesture listeners remain as
    // a browser-policy fallback for mobile browsers that demand a fresh gesture.
    const syncAudioVisibility = () => {
      if (document.visibilityState !== 'visible') {
        suspendPitchAudio()
        return
      }
      if (soundOn) unlockPitchAudio()
    }

    const suspendForPageHide = () => suspendPitchAudio()
    const unlockOnGesture = () => {
      if (soundOn && document.visibilityState === 'visible') unlockPitchAudio()
    }

    document.addEventListener('visibilitychange', syncAudioVisibility)
    window.addEventListener('pagehide', suspendForPageHide)
    window.addEventListener('pageshow', syncAudioVisibility)
    window.addEventListener('pointerdown', unlockOnGesture, { passive: true })
    window.addEventListener('keydown', unlockOnGesture)

    syncAudioVisibility()

    return () => {
      document.removeEventListener('visibilitychange', syncAudioVisibility)
      window.removeEventListener('pagehide', suspendForPageHide)
      window.removeEventListener('pageshow', syncAudioVisibility)
      window.removeEventListener('pointerdown', unlockOnGesture)
      window.removeEventListener('keydown', unlockOnGesture)
    }
  }, [soundOn])

  useEffect(() => {
    try {
      window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({
        scene,
        showClock,
        soundOn,
        layers,
      } satisfies PitchPreferences))
    } catch {
      // Preferences are optional in private/restricted browser contexts.
    }
  }, [scene, showClock, soundOn, layers])

  const goFullscreen = async () => {
    unlockPitchAudio()
    try {
      const doc = document as Document & {
        webkitFullscreenElement?: Element | null
        webkitExitFullscreen?: () => Promise<void> | void
      }
      const root = document.documentElement as HTMLElement & {
        webkitRequestFullscreen?: () => Promise<void> | void
      }
      const fullscreenElement = document.fullscreenElement ?? doc.webkitFullscreenElement

      if (!fullscreenElement) {
        if (typeof root.requestFullscreen === 'function') await root.requestFullscreen()
        else if (typeof root.webkitRequestFullscreen === 'function') await root.webkitRequestFullscreen()
      } else if (typeof document.exitFullscreen === 'function') {
        await document.exitFullscreen()
      } else if (typeof doc.webkitExitFullscreen === 'function') {
        await doc.webkitExitFullscreen()
      }
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
      <div className="scene-layer">
        <GlobalMoon visible={layers.moon} />
        <div className={`world-weather-layer ${scene === 'black' ? 'world-hidden' : ''}`}>
          <WorldBaseScene scene={scene} />
          <SnowScene active={scene === 'snow'} soundOn={soundOn} speed={1} />
          <RainScene active={scene === 'rain'} soundOn={soundOn} speed={1} />
          <EmberScene
            active={scene === 'ember'}
            rainActive={scene === 'rain'}
            snowActive={scene === 'snow'}
            speed={1}
            soundOn={soundOn}
            visible={scene !== 'black'}
          />
        </div>
        <FirefliesLayer active={layers.fireflies} visible />
        <StormLayer active={layers.storm} scene={scene} soundOn={soundOn} />
      </div>

      {showClock && <ClockDisplay awake={controlsVisible} />}

      <button
        type="button"
        className={`brand-whisper ${controlsVisible ? 'visible' : ''}`}
        onClick={() => setShowUtilities((value) => !value)}
        aria-expanded={showUtilities}
        aria-controls="pitchblack-utilities"
        aria-label="Open this quiet world utilities"
      >
        this quiet world
      </button>

      <div
        id="pitchblack-utilities"
        className={`utility-popover ${controlsVisible && showUtilities ? 'visible' : ''}`}
        aria-hidden={!controlsVisible || !showUtilities}
      >
        <button
          type="button"
          onClick={() => {
            resetWorld()
            setShowUtilities(false)
          }}
        >
          Reset world
        </button>
      </div>

      <nav className={`control-dock ${controlsVisible ? 'visible' : ''}`} aria-label="This quiet world controls">
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
