# Security Configuration

Security best practices and configuration for Crucible Community Edition.

## Overview

This guide covers security configuration for production deployments. Security is a shared responsibility between the software and your deployment practices.

## Password Security

### Hashing Passwords

**For production, always hash passwords:**

```bash
cd service
python -m scripts.hash_password <your-secure-password>
```

Update `.env`:
```bash
ROUNDTABLE_COMMUNITY_AUTH_PASSWORD=<generated-hash>
```

**Why:** Plain text passwords are less secure. Hashed passwords cannot be reversed.

### Password Best Practices

- Use strong, unique passwords
- Change default password immediately
- Store password securely (password manager)
- Rotate passwords periodically

## Encryption Keys

### API Key Encryption

API keys are encrypted using `API_KEY_ENCRYPTION_KEY`:

- **Never share this key**
- **Backup securely** - Required to decrypt stored API keys
- **Rotate carefully** - Changing it makes stored keys unrecoverable
- **Use strong key** - 32+ characters, randomly generated

### JWT Secrets

JWT tokens use secrets for signing:

- `ROUNDTABLE_JWT_SECRET` - Access token signing
- `ROUNDTABLE_JWT_REFRESH_SECRET` - Refresh token signing

**Best Practices:**
- Use different secrets for each environment
- Generate strong, random secrets
- Rotate periodically
- Never commit to version control

## Network Security

### HTTPS/TLS

**Always use HTTPS in production:**

1. Set up reverse proxy (nginx, Traefik, etc.)
2. Configure SSL/TLS certificates
3. Update environment variables to use HTTPS URLs
4. Enable HSTS headers

### CORS Configuration

Configure allowed origins:

```bash
ROUNDTABLE_CORS_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
```

**Best Practices:**
- Only include trusted domains
- Remove `http://localhost:3000` in production
- Use HTTPS URLs only
- Test CORS configuration

### Firewall Rules

- Restrict access to necessary ports only
- Use firewall to limit external access
- Consider VPN for administrative access
- Monitor network traffic

### Port Exposure Security

**CRITICAL**: Database and Redis ports should NOT be exposed to the host in production.

**Default Configuration:**
- ✅ PostgreSQL (5432): **NOT exposed** - Services use internal Docker networking (`postgres:5432`)
- ✅ Redis (6379): **NOT exposed** - Services use internal Docker networking (`redis:6379`)
- ✅ API (8000): Exposed for HTTP access
- ✅ Frontend (3000): Exposed for web access

**Why This Matters:**
- Exposing database/Redis ports creates unnecessary attack surface
- Services can communicate via Docker's internal network without port exposure
- Reduces risk of unauthorized access if firewall is misconfigured

**Development Access:**
If you need direct database/Redis access for debugging:
1. Uncomment port mappings in `docker-compose.yml` (development only)
2. **Restrict to localhost**: Use `127.0.0.1:5432:5432` instead of `5432:5432`
3. Configure firewall to block external access
4. Never expose ports in production

**Accessing Services:**
```bash
# Access PostgreSQL without port exposure
docker compose exec postgres psql -U $POSTGRES_USER -d roundtable

# Access Redis without port exposure
docker compose exec redis redis-cli -a $REDIS_PASSWORD

# Or use docker-compose exec for any service
docker compose exec api python -m scripts.init_community_db
```

## Database Security

### Connection Security

- Use encrypted connections (SSL/TLS)
- Use strong database passwords
- Limit database access to application only
- Use connection pooling appropriately

### Backup Security

- Encrypt database backups
- Store backups securely
- Test backup restoration
- Rotate backup retention

## Environment Variables

### Security Checklist

- [ ] All secrets are strong and unique
- [ ] `.env` file is in `.gitignore`
- [ ] `.env` file is backed up securely
- [ ] No secrets in code or logs
- [ ] Environment variables validated on startup

### Secret Management

**Options:**
- Environment variables (current method)
- Secret management services (HashiCorp Vault, AWS Secrets Manager, etc.)
- Docker secrets (for Docker Swarm)
- Kubernetes secrets (for Kubernetes)

## Application Security

### Rate Limiting

Rate limiting is enabled by default:
- 100,000 tokens per minute (TPM) limit
- Configurable per endpoint
- Protects against abuse

### Input Validation

- All inputs are validated
- SQL injection protection via ORM
- XSS protection in frontend
- CSRF protection via NextAuth

### Error Handling

- Errors don't expose sensitive information
- Stack traces hidden in production
- Secure error logging

## Monitoring and Logging

### Security Monitoring

- Monitor authentication attempts
- Track API usage patterns
- Alert on suspicious activity
- Review logs regularly

### Log Security

- Don't log sensitive data
- Secure log storage
- Rotate logs regularly
- Monitor log access

## Updates and Patches

### Regular Updates

- Update Docker images regularly
- Monitor security advisories
- Apply patches promptly
- Test updates in staging first

### Dependency Management

- Keep dependencies updated
- Review security advisories
- Use dependency scanning tools
- Update critical dependencies first

## Compliance Considerations

### Data Residency

- Configure data storage location
- Understand data processing locations
- Consider regional requirements
- Document data flows

### Audit Logging

- Enable audit logging
- Review audit logs regularly
- Retain logs per requirements
- Secure log storage

## Security Checklist

### Pre-Production

- [ ] Passwords hashed
- [ ] Strong encryption keys
- [ ] HTTPS configured
- [ ] CORS properly configured
- [ ] Firewall rules set
- [ ] Backups configured
- [ ] Monitoring enabled
- [ ] Logs secured

### Ongoing

- [ ] Regular security reviews
- [ ] Dependency updates
- [ ] Log monitoring
- [ ] Access control reviews
- [ ] Incident response plan

## Incident Response

### If Compromised

1. **Isolate** affected systems
2. **Assess** scope of compromise
3. **Rotate** all secrets immediately
4. **Review** logs for suspicious activity
5. **Notify** affected users if required
6. **Document** incident and response

## Resources

- [Production Deployment Guide](../deployment/production.md) - Production setup
- [Environment Variables Reference](../deployment/environment-variables.md) - Configuration
- [Troubleshooting Guide](../deployment/troubleshooting.md) - Common issues

## Next Steps

- [API Keys Configuration](api-keys.md) - Configure LLM providers
- [Production Deployment](../deployment/production.md) - Production setup
