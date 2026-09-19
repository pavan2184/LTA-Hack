#!/usr/bin/env bash
# Public, standalone educational service. Does not configure accounts or IAM.
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: bash demos/algorithm-lab/deploy.sh PROJECT_ID REGION RUNTIME_SERVICE_ACCOUNT

Requires a selected, authenticated gcloud account; an existing billing-enabled
project; enabled Run, Cloud Build and Artifact Registry APIs; and a dedicated
runtime service account without application permissions. See README.md.

Deploys the public railplan-algorithm-lab service. It does not log in, create a
project/service account, enable APIs, or grant project permissions.
USAGE
}

fail() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

if [[ $# -eq 1 && ( $1 == --help || $1 == -h ) ]]; then
  usage
  exit 0
fi
if [[ $# -ne 3 ]]; then
  usage >&2
  exit 2
fi

project_id=$1
cloud_region=$2
runtime_sa=$3
service_name=railplan-algorithm-lab
lab_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)

[[ $project_id =~ ^[a-z][a-z0-9-]{4,28}[a-z0-9]$ ]] || fail 'Use a Google Cloud project ID, not a project name or number.'
[[ $cloud_region =~ ^[a-z]+(-[a-z]+)+[0-9]+$ ]] || fail 'Use an explicit Google Cloud region, such as asia-southeast1.'
[[ $runtime_sa == *@"${project_id}.iam.gserviceaccount.com" ]] || fail 'Use a dedicated runtime service account in the selected project.'
[[ $runtime_sa =~ ^[a-z][a-z0-9-]{4,28}[a-z0-9]@ ]] || fail 'Invalid runtime service-account email.'

command -v gcloud >/dev/null 2>&1 || fail 'Install the Google Cloud CLI or use Google Cloud Shell; no cloud changes were made.'
deploy_account=$(gcloud auth list --filter=status:ACTIVE --format='value(account)')
[[ -n $deploy_account && $deploy_account != *$'\n'* ]] || fail 'Select one authenticated gcloud account before deploying.'

cloud() {
  gcloud --account="$deploy_account" --project="$project_id" "$@"
}

printf 'Account: %s\nProject: %s\nRegion: %s\nPublic service: %s\nRuntime identity: %s\n' \
  "$deploy_account" "$project_id" "$cloud_region" "$service_name" "$runtime_sa"

project_state=$(cloud projects describe "$project_id" --format='value(lifecycleState)')
[[ $project_state == ACTIVE ]] || fail 'The selected project is not active.'
billing_enabled=$(cloud billing projects describe "$project_id" --format='value(billingEnabled)')
[[ $billing_enabled == True || $billing_enabled == true ]] || fail 'Billing must already be enabled on the selected project.'

enabled_apis=$(cloud services list --enabled --format='value(config.name)')
for required_api in run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com; do
  api_found=false
  while IFS= read -r enabled_api; do
    if [[ $enabled_api == "$required_api" ]]; then api_found=true; fi
  done <<< "$enabled_apis"
  [[ $api_found == true ]] || fail "Required API is not enabled: $required_api. Ask the project administrator to prepare it."
done

runtime_disabled=$(cloud iam service-accounts describe "$runtime_sa" --format='value(disabled)')
[[ $runtime_disabled != True && $runtime_disabled != true ]] || fail 'The runtime service account is disabled.'
runtime_roles=$(cloud projects get-iam-policy "$project_id" \
  --flatten='bindings[].members' \
  --filter="bindings.members=serviceAccount:$runtime_sa" \
  --format='value(bindings.role)')
[[ -z $runtime_roles ]] || fail 'The runtime account has project roles. Use a dedicated account with no application permissions.'
# Resource-level/inherited IAM is not covered by this project-policy check.
# The operator must also check those grants; this demo needs no Google API access.

existing_services=$(cloud run services list --region="$cloud_region" --format='value(metadata.name)')
while IFS= read -r existing_service; do
  if [[ $existing_service == "$service_name" ]]; then
    component_label=$(cloud run services describe "$service_name" --region="$cloud_region" \
      --format='value(metadata.labels.railplan_component)')
    [[ $component_label == algorithm-lab ]] || fail 'A service with this name exists without the algorithm-lab ownership label; refusing to overwrite it.'
  fi
done <<< "$existing_services"

cd -- "$lab_dir"
for required_file in main.py model.py requirements.txt Procfile .python-version .gcloudignore static/index.html static/style.css static/app.js static/icon.svg static/fonts/plex-sans-latin.woff2 static/fonts/plex-mono-latin.woff2 static/fonts/OFL.txt; do
  [[ -f $required_file && ! -L $required_file ]] || fail "Missing or symlinked deployment file: $required_file"
done
[[ ! -L static && ! -L static/fonts ]] || fail 'Deployment asset directories must not be symlinks.'

upload_files=$(gcloud meta list-files-for-upload)
[[ -n $upload_files ]] || fail 'The deployment upload manifest is empty.'
normalized_upload_files=$'\n'
while IFS= read -r upload_file; do
  upload_file=${upload_file#./}
  case "$upload_file" in
    main.py|model.py|requirements.txt|Procfile|.python-version|.gcloudignore|static/index.html|static/style.css|static/app.js|static/icon.svg|static/fonts/*.woff2|static/fonts/OFL.txt) ;;
    *) fail "Unexpected source upload: $upload_file. Review .gcloudignore before deployment." ;;
  esac
  [[ -f $upload_file && ! -L $upload_file ]] || fail "Source upload must be a regular file: $upload_file"
  normalized_upload_files+="$upload_file"$'\n'
done <<< "$upload_files"
for required_file in main.py model.py requirements.txt Procfile .python-version static/index.html static/style.css static/app.js static/icon.svg static/fonts/plex-sans-latin.woff2 static/fonts/plex-mono-latin.woff2 static/fonts/OFL.txt; do
  [[ $normalized_upload_files == *$'\n'"$required_file"$'\n'* ]] || fail "A required runtime file was excluded from the upload: $required_file"
done

printf '\nSource upload is restricted to the lab runtime and static assets.\n'
printf 'Cloud Run, remote builds, artifact storage and traffic may incur charges.\n'

cloud run deploy "$service_name" \
  --source="$lab_dir" \
  --region="$cloud_region" \
  --service-account="$runtime_sa" \
  --labels=railplan_component=algorithm-lab \
  --allow-unauthenticated \
  --ingress=all \
  --min=0 \
  --max=1 \
  --min-instances=0 \
  --max-instances=1 \
  --concurrency=4 \
  --cpu=1 \
  --memory=512Mi \
  --timeout=30s \
  --port=8080 \
  --cpu-throttling \
  --no-cpu-boost \
  --clear-env-vars \
  --clear-secrets \
  --clear-build-env-vars \
  --quiet

cloud run services describe "$service_name" --region="$cloud_region" --format='value(status.url)'
