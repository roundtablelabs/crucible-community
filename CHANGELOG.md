# Changelog

All notable changes to Crucible Community Edition will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Community contribution guidelines (CONTRIBUTING.md)
- Code of Conduct (CODE_OF_CONDUCT.md)
- Organized documentation structure

## [1.0.0] - 2026-01-24

### Added
- Initial community edition release
- Docker-based deployment with docker-compose
- Self-hosted single-user mode
- Core debate functionality with AI knights
- Live debate streaming with real-time updates
- PDF decision brief generation
- Prebuilt knight library
- Bring Your Own Key (BYOK) model for LLM providers
- Environment variable-based configuration
- Automatic secret generation scripts
- Support for multiple LLM providers (OpenRouter, OpenAI, Anthropic, Google, DeepSeek, etc.)
- Session management and history
- User authentication (community edition mode)
- API key management in UI
- Customizable branding via environment variables
- Comprehensive documentation

### Security
- API key encryption using Fernet
- Password hashing with bcrypt
- JWT-based authentication
- Redis password authentication
- Environment variable validation
- Secure defaults for production

### Documentation
- Installation guide
- Environment variables reference
- Troubleshooting guide
- Production deployment considerations
- Development setup instructions

## Version History

- **1.0.0** (2026-01-24): Initial community edition release

## How to Read This Changelog

- **Added**: New features
- **Changed**: Changes to existing functionality
- **Deprecated**: Features that will be removed in future versions
- **Removed**: Removed features
- **Fixed**: Bug fixes
- **Security**: Security-related changes
