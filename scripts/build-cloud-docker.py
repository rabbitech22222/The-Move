"""Build the development image through the cloud's existing HTTPS egress proxy.

A supplied CA is a build secret, never copied into the image. Normal local builds
can use `docker compose build` without this environment-specific helper.
"""
import os
import pathlib
import socket
import subprocess
import urllib.parse

args = ["docker", "build", "--tag", "the-move-os:local"]
proxy_url = os.environ.get("HTTPS_PROXY") or os.environ.get("HTTP_PROXY")
if proxy_url:
    hostname = urllib.parse.urlsplit(proxy_url).hostname
    if not hostname:
        raise SystemExit("The provided proxy hostname is invalid.")
    # Public credentials are not extracted, logged or saved. Docker's predefined
    # proxy build arguments are forwarded by name and omitted from image history.
    args += ["--add-host", f"{hostname}:{socket.gethostbyname(hostname)}"]
    for variable in ["HTTPS_PROXY", "HTTP_PROXY", "NO_PROXY"]:
        if os.environ.get(variable):
            args += ["--build-arg", variable]
ca_file = os.environ.get("NODE_EXTRA_CA_CERTS")
if ca_file:
    if not pathlib.Path(ca_file).is_file():
        raise SystemExit("The environment's trusted CA file is not readable.")
    args += ["--secret", f"id=build_ca,src={ca_file}"]
args += ["."]
environment = dict(os.environ)
# Cloud home configuration can be read-only; no existing credentials are copied.
if pathlib.Path("/workspace").is_dir():
    config = pathlib.Path("/workspace/.docker-local")
    config.mkdir(exist_ok=True)
    environment.setdefault("DOCKER_CONFIG", str(config))
raise SystemExit(subprocess.run(args, env=environment).returncode)
