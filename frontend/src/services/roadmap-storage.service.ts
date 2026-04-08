/**
 * Roadmap Storage Service
 * Handles saving and loading roadmaps from localStorage
 */

import type { ParsedRoadmap } from '../components/QuizFlowManager';
import type { CertStatus } from './ai-agent.service';

export interface SavedRoadmap {
  id: string;
  title: string;
  profile: string;
  level: string;
  createdAt: string;
  updatedAt: string;
  roadmap: ParsedRoadmap;
  certStatuses?: Record<string, CertStatus>;
}

const STORAGE_KEY = 'subul_saved_roadmaps';

export const RoadmapStorageService = {
  /**
   * Save a new roadmap or update existing
   */
  saveRoadmap(roadmap: ParsedRoadmap, profile: string, level: string, certStatuses?: Record<string, CertStatus>): SavedRoadmap {
    const savedRoadmaps = this.getAllRoadmaps();
    
    const newRoadmap: SavedRoadmap = {
      id: `roadmap_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title: roadmap.roadmap_title,
      profile,
      level,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      roadmap,
      certStatuses,
    };
    
    savedRoadmaps.unshift(newRoadmap); // Add to beginning
    localStorage.setItem(STORAGE_KEY, JSON.stringify(savedRoadmaps));
    
    return newRoadmap;
  },

  /**
   * Get all saved roadmaps
   */
  getAllRoadmaps(): SavedRoadmap[] {
    if (typeof window === 'undefined') return [];
    
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    
    try {
      return JSON.parse(stored);
    } catch {
      return [];
    }
  },

  /**
   * Get a single roadmap by ID
   */
  getRoadmapById(id: string): SavedRoadmap | null {
    const roadmaps = this.getAllRoadmaps();
    return roadmaps.find(r => r.id === id) || null;
  },

  /**
   * Update roadmap cert statuses
   */
  updateRoadmapCertStatuses(id: string, certStatuses: Record<string, CertStatus>): boolean {
    const roadmaps = this.getAllRoadmaps();
    const index = roadmaps.findIndex(r => r.id === id);
    
    if (index === -1) return false;
    
    roadmaps[index].certStatuses = certStatuses;
    roadmaps[index].updatedAt = new Date().toISOString();
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(roadmaps));
    return true;
  },

  /**
   * Delete a roadmap
   */
  deleteRoadmap(id: string): boolean {
    const roadmaps = this.getAllRoadmaps();
    const filtered = roadmaps.filter(r => r.id !== id);
    
    if (filtered.length === roadmaps.length) return false;
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    return true;
  },

  /**
   * Get the most recent roadmap
   */
  getMostRecentRoadmap(): SavedRoadmap | null {
    const roadmaps = this.getAllRoadmaps();
    return roadmaps[0] || null;
  },

  /**
   * Check if user has any saved roadmaps
   */
  hasRoadmaps(): boolean {
    return this.getAllRoadmaps().length > 0;
  },

  /**
   * Clear all roadmaps
   */
  clearAllRoadmaps(): void {
    localStorage.removeItem(STORAGE_KEY);
  },
};

export default RoadmapStorageService;
