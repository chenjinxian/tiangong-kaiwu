/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITwin, ITwinsAccessClient, ITwinsQueryArg, ITwinSubClass } from '@itwin/itwins-client';
import type { CreateProjectRequest, Project, ProjectListResponse, UpdateProjectRequest } from './types.js';
import { logger } from '../utils/logger.js';
import { config } from '../config.js';

// Create iTwins client for project operations
const iTwinsClient = new ITwinsAccessClient(`${config.IMODELHUB_URL}/itwins`);

// Helper to convert ITwin to Project
function toProject(iTwin: ITwin): Project {
  return {
    id: iTwin.id ?? '',
    name: iTwin.displayName || iTwin.number || 'Unnamed Project',
    description: '', // iTwin API doesn't have description field directly
    createdBy: iTwin.createdBy || '',
    createdAt: iTwin.createdDateTime || new Date().toISOString(),
    updatedAt: iTwin.createdDateTime || new Date().toISOString(), // Use created as fallback
    memberCount: 1, // Default as this isn't in the base ITwin interface
    imodelCount: 0, // Default as this isn't in the base ITwin interface
  };
}

export class ProjectService {
  /**
   * Create a new project via imodelhub-services
   */
  public static async create(userId: string, request: CreateProjectRequest, accessToken?: string): Promise<Project> {
    if (!accessToken) {
      throw new Error('Access token required');
    }

    // Create iTwin through imodelhub-services
    const response = await iTwinsClient.createiTwin(accessToken, {
      displayName: request.name,
      subClass: ITwinSubClass.Project,
    });

    if (response.error) {
      throw new Error(response.error.message);
    }

    if (!response.data) {
      throw new Error('Failed to create project');
    }

    return toProject(response.data);
  }

  /**
   * Get project by ID via imodelhub-services
   */
  public static async getById(projectId: string, userId: string, accessToken?: string): Promise<Project | null> {
    if (!accessToken) {
      return null;
    }

    try {
      const response = await iTwinsClient.getAsync(accessToken, projectId);

      if (response.error || !response.data) {
        return null;
      }

      return toProject(response.data);
    } catch (error) {
      logger.error('Failed to get project', error as Error);
      return null;
    }
  }

  /**
   * List user's projects via imodelhub-services
   */
  public static async list(userId: string, page: number = 1, pageSize: number = 20, accessToken?: string): Promise<ProjectListResponse> {
    if (!accessToken) {
      return {
        projects: [],
        total: 0,
        page,
        pageSize,
      };
    }

    try {
      // Query parameters for pagination
      const query: ITwinsQueryArg = {
        subClass: ITwinSubClass.Project,
        skip: (page - 1) * pageSize,
        top: pageSize,
      };

      // Get iTwins (projects) from imodelhub-services
      const response = await iTwinsClient.queryAsync(accessToken, undefined, query);

      if (response.error) {
        throw new Error(response.error.message);
      }

      const projects = (response.data || []).map(toProject);

      return {
        projects,
        total: projects.length,
        page,
        pageSize,
      };
    } catch (error) {
      logger.error('Failed to list projects', error as Error);
      return {
        projects: [],
        total: 0,
        page,
        pageSize,
      };
    }
  }

  /**
   * Update project via imodelhub-services
   */
  public static async update(projectId: string, userId: string, request: UpdateProjectRequest, accessToken?: string): Promise<Project | null> {
    if (!accessToken) {
      return null;
    }

    try {
      // Get current project
      const current = await this.getById(projectId, userId, accessToken);
      if (!current) {
        return null;
      }

      // Update iTwin through imodelhub-services
      const response = await iTwinsClient.updateiTwin(accessToken, projectId, {
        displayName: request.name ?? current.name,
        subClass: ITwinSubClass.Project,
      });

      if (response.error || !response.data) {
        return null;
      }

      return toProject(response.data);
    } catch (error) {
      logger.error('Failed to update project', error as Error);
      return null;
    }
  }

  /**
   * Delete project via imodelhub-services
   */
  public static async delete(projectId: string, userId: string, accessToken?: string): Promise<boolean> {
    if (!accessToken) {
      return false;
    }

    try {
      // Delete iTwin through imodelhub-services
      const response = await iTwinsClient.deleteiTwin(accessToken, projectId);

      if (response.error) {
        return false;
      }

      return true;
    } catch (error) {
      logger.error('Failed to delete project', error as Error);
      return false;
    }
  }

  /**
   * Search projects via imodelhub-services
   */
  public static async search(userId: string, query: string, accessToken?: string): Promise<Project[]> {
    if (!accessToken) {
      return [];
    }

    try {
      // Search iTwins through imodelhub-services
      const response = await iTwinsClient.queryAsync(accessToken, undefined, {
        subClass: ITwinSubClass.Project,
        search: query,
        top: 50,
      });

      if (response.error) {
        return [];
      }

      return (response.data || []).map(toProject);
    } catch (error) {
      logger.error('Failed to search projects', error as Error);
      return [];
    }
  }
}
