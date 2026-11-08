#!/bin/sh
set -eu
# Run from the repository root. Downloads remain in an ephemeral directory.
cache=$(mktemp -d "${TMPDIR:-/tmp}/zero-spring-reference.XXXXXX")
trap 'rm -rf "$cache"' EXIT
for module in spring-context spring-core; do
  curl -fsSL "https://repo.maven.apache.org/maven2/org/springframework/$module/7.0.10/$module-7.0.10.jar" -o "$cache/$module.jar"
done
classpath="$cache/spring-context.jar:$cache/spring-core.jar"
javac -cp "$classpath" -d "$cache" website/experiments/everyday/SpringCronReference.java website/experiments/everyday/SpringCronOffsetReference.java
java -cp "$cache:$classpath" SpringCronReference > website/experiments/everyday/spring-7.0.10-reference.txt
java -cp "$cache:$classpath" SpringCronOffsetReference L-0 L-27 L-28 L-30 L-31 L-100 > website/experiments/everyday/spring-offset-edge-reference.txt
