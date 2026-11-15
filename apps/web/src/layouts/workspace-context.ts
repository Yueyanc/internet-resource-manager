import { createContext, useContext } from 'react';
export const WorkspaceContext = createContext({
  search: '',
  setSearch: (_value: string) => {
    void _value;
  },
  newSubscription: () => {},
  newAccount: () => {},
  newDomain: () => {},
  newIp: () => {},
  newServer: () => {},
});
export function useWorkspace() {
  return useContext(WorkspaceContext);
}
