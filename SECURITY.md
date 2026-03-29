# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please report it responsibly.

**Do not open a public GitHub issue.**

Instead, please use [GitHub Security Advisories](https://github.com/naom1029/electron-messageport-trpc/security/advisories/new) to report the vulnerability privately.

You can expect an initial response within 72 hours.

## Scope

This project provides an IPC transport layer for Electron applications. Security-relevant areas include:

- Message serialization and deserialization
- Port lifecycle and cleanup
- Context isolation (contextBridge interactions)
- Input validation at process boundaries
