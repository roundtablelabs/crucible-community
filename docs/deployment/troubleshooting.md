# Troubleshooting Guide

Common issues and solutions for Crucible Community Edition deployments.

## Installation Issues

### "Python not found" Error

**Symptoms:** Scripts fail with "python: command not found"

**Solutions:**
- Install Python 3.8+ from https://python.org
- Ensure `python` or `python3` is in your PATH
- Restart your terminal after installing
- On Windows, ensure Python is added to PATH during installation

### "Docker not found" Error

**Symptoms:** Scripts fail with "docker: command not found"

**Solutions:**
- Install Docker Desktop from https://docker.com
- Ensure Docker is running (check system tray/status)
- Restart your terminal after installing
- Verify: `docker --version` should work

### Windows: Script Asks Which Application to Open

**Symptoms:** Double-clicking `.sh` files opens a dialog asking which app to use

**Solutions:**
- **Don't use `.sh` files on Windows!**
- Use `.\docker-compose.ps1` in PowerShell
- Use `.\docker-compose.bat` in Command Prompt
- Always use `.\` prefix on Windows

## Service Startup Issues

### Services Won't Start

**Symptoms:** `docker compose up -d` fails or services exit immediately

**Solutions:**
1. Check Docker is running: `docker ps`
2. Check logs: `docker compose logs`
3. Verify `.env` file exists: `ls -la .env` (Linux/macOS) or `dir .env` (Windows)
4. Try regenerating secrets: Delete `.env` and run setup script again
5. Check port conflicts: Ensure ports 3000 and 8000 are available
6. Check disk space: `df -h` (Linux/macOS) or check disk properties (Windows)

### Database "does not exist" Error

**Symptoms:** Error like `FATAL: database "username" does not exist`

**Solutions:**
1. This usually means there's an old PostgreSQL volume with conflicting data
2. **Solution**: Remove the old volume and restart:
   ```bash
   docker compose down -v
   docker compose up -d
   ```
   **WARNING**: This deletes all data. Make sure to backup your `.env` file first!

### Port Already in Use

**Symptoms:** Error about ports being already in use

**Solutions:**
1. Find what's using the port:
   ```bash
   # Linux/macOS
   lsof -i :3000
   lsof -i :8000
   
   # Windows
   netstat -ano | findstr :3000
   ```
2. Stop the conflicting service or change ports in `docker-compose.prod.yml`

## Access Issues

### Can't Access http://localhost:3000

**Symptoms:** Browser shows connection error or timeout

**Solutions:**
1. Check services are running: `docker compose ps`
2. Check frontend logs: `docker compose logs frontend`
3. Verify port 3000 is not in use by another application
4. Try accessing http://localhost:8000/docs to verify API is running
5. Check firewall settings
6. Try `http://127.0.0.1:3000` instead of `localhost`

### API Connection Errors

**Symptoms:** Frontend shows "Failed to fetch" or CORS errors

**Solutions:**
1. Verify API is running: `docker compose logs api`
2. Check `NEXT_PUBLIC_API_URL` in frontend environment
3. Ensure `ROUNDTABLE_CORS_ORIGINS` includes frontend URL
4. Check browser console for specific error messages
5. Verify network connectivity between containers

## Authentication Issues

### Forgot Password

**Symptoms:** Can't remember login password

**Solutions:**
1. Check `.env` file for `ROUNDTABLE_COMMUNITY_AUTH_PASSWORD`
2. If password is hashed, you'll need to reset it:
   ```bash
   cd service
   python -m scripts.hash_password <new-password>
   ```
   Then update `.env` and restart: `docker compose restart api`
3. Or delete `.env` and regenerate (WARNING: This makes existing encrypted API keys unreadable!)

### Login Not Working

**Symptoms:** Can't log in with credentials

**Solutions:**
1. Verify email is `admin@community.local`
2. Check password in `.env` file
3. Check API logs: `docker compose logs api`
4. Verify database is accessible
5. Try resetting password (see above)

## Database Issues

### Database Connection Errors

**Symptoms:** API logs show database connection failures

**Solutions:**
1. Check PostgreSQL is running: `docker compose ps postgres`
2. Check PostgreSQL logs: `docker compose logs postgres`
3. Verify `ROUNDTABLE_DATABASE_URL` format in `.env`
4. Ensure database exists and is initialized
5. Check database credentials match `.env` values

### Database Schema Errors

**Symptoms:** Database schema errors or missing tables

**Solutions:**
1. Check initialization logs: `docker compose logs api`
2. Manually reinitialize the database:
   ```bash
   docker compose exec api python -m scripts.init_community_db
   ```
3. Verify database is accessible
4. Check that SQLAlchemy models match expected schema

## Performance Issues

### Slow Response Times

**Symptoms:** Application is slow or unresponsive

**Solutions:**
1. Check resource usage: `docker stats`
2. Increase Docker resource limits
3. Check database query performance
4. Monitor Redis cache hit rates
5. Review API logs for slow queries
6. Consider scaling services

### High Memory Usage

**Symptoms:** System running out of memory

**Solutions:**
1. Check memory usage: `docker stats`
2. Reduce resource limits in `docker-compose.prod.yml`
3. Close unnecessary containers
4. Increase system RAM if possible
5. Optimize database queries

## API Key Issues

### API Keys Not Working

**Symptoms:** LLM features not working despite configured keys

**Solutions:**
1. Verify API key is correct in Settings page
2. Check API key format (provider-specific)
3. Verify API key has sufficient credits/quota
4. Check API provider status
5. Review API logs: `docker compose logs api`
6. Test API key directly with provider

### Encrypted Keys Lost

**Symptoms:** Can't decrypt stored API keys after `.env` regeneration

**Solutions:**
- **Prevention**: Always backup `.env` file
- **Recovery**: Users must re-enter API keys in Settings
- **Note**: If `API_KEY_ENCRYPTION_KEY` changes, all encrypted keys become unrecoverable

## Logs and Debugging

### Viewing Logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f api
docker compose logs -f frontend
docker compose logs -f postgres

# Last 100 lines
docker compose logs --tail=100 api
```

### Common Log Patterns

**Database connection errors:**
- Check `ROUNDTABLE_DATABASE_URL`
- Verify PostgreSQL is running
- Check network connectivity

**Redis connection errors:**
- Check `ROUNDTABLE_REDIS_URL`
- Verify Redis is running
- Check password authentication

**API key errors:**
- Verify API key format
- Check provider status
- Review rate limits

## Getting Help

If you can't resolve an issue:

1. **Check existing issues**: Search GitHub Issues for similar problems
2. **Review documentation**: Check relevant guides in `docs/`
3. **Collect information**:
   - Service logs
   - Error messages
   - Environment details (OS, Docker version, etc.)
   - Steps to reproduce
4. **Create an issue**: Provide detailed information

## Prevention Tips

- **Backup regularly**: Especially `.env` file and database
- **Monitor logs**: Set up log monitoring
- **Update regularly**: Pull latest images
- **Test changes**: Test in development before production
- **Document changes**: Keep notes on custom configurations

## Next Steps

- [Production Deployment](production.md) - Production best practices
- [Configuration Guide](../configuration/README.md) - Customization options
- [Development Guide](../development/README.md) - Development setup
