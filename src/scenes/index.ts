import familyDinner from '../../content/scenes/family-dinner.json'
import taxi from '../../content/scenes/taxi.json'
import type { Scene } from '../scene'
import { sceneFromFile } from './adapter'

/** The starter scenes that ship with the app (content/scenes, format in docs/scenes.md). */
export const starterScenes: Scene[] = [familyDinner, taxi].map(sceneFromFile)
