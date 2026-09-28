// Replaces environment.ts in development builds (angular.json fileReplacements), so it can't
// import that file: the import would resolve to this one.
export const environment = {
  agencyName: 'CivicFlow Demo Agency',
  showDemoAccounts: true,
};
