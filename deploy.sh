#!/bin/bash
# Retired.
#
# This script used to build a Docker image and point Nginx at
# outputtracer.devs.surf. That is not the production site.
#
# The canonical deploy path is scripts/deploy-production.sh, which targets
# https://outputtracer.com, builds a candidate release, and rolls back to
# .next.prev if promotion fails.
#
# This file intentionally exits before it changes a host, a container, or DNS.

echo "deploy.sh is retired and did not change anything." >&2
echo "Use scripts/deploy-production.sh for https://outputtracer.com." >&2
exit 1
