import dbClient from '../utils/db';
import redisClient from '../utils/redis';

class FilesController {
  static async getShow(req, res) {
    // Validate token
    const token = req.headers['x-token'];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    try {
      const db = await dbClient.db();
      const fileId = req.params.id;

      // Find file for the specific user
      const file = await db.collection('files').findOne({
        _id: dbClient.objectId(fileId),
        userId: dbClient.objectId(userId)
      });

      if (!file) return res.status(404).json({ error: 'Not found' });

      // Return file details
      return res.json({
        id: file._id,
        userId: file.userId,
        name: file.name,
        type: file.type,
        isPublic: file.isPublic,
        parentId: file.parentId
      });
    } catch (error) {
      return res.status(500).json({ error: 'Server error' });
    }
  }

  static async getIndex(req, res) {
    // Validate token
    const token = req.headers['x-token'];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    try {
      const db = await dbClient.db();
      
      // Parse query parameters
      const parentId = req.query.parentId || '0';
      const page = parseInt(req.query.page, 10) || 0;
      const itemsPerPage = 20;

      // Aggregate pipeline for pagination
      const pipeline = [
        { 
          $match: { 
            userId: dbClient.objectId(userId),
            parentId: parentId === '0' ? '0' : dbClient.objectId(parentId)
          }
        },
        { $skip: page * itemsPerPage },
        { $limit: itemsPerPage }
      ];

      const files = await db.collection('files').aggregate(pipeline).toArray();

      // Transform files for response
      const formattedFiles = files.map(file => ({
        id: file._id,
        userId: file.userId,
        name: file.name,
        type: file.type,
        isPublic: file.isPublic,
        parentId: file.parentId
      }));

      return res.json(formattedFiles);
    } catch (error) {
      return res.status(500).json({ error: 'Server error' });
    }
  }
}

export default FilesController;