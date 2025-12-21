import { Button } from '@heroui/button'
import { Modal, ModalBody, ModalContent, ModalHeader } from '@heroui/modal'

type Provider = {
  id: string
  displayName: string
  loginUrl: string
  configured: boolean
  missingConfigKeys?: string[]
}

type LoginOverlayProps = {
  providers: Provider[] | null
  error: string | null
  onRetry: () => void
}

export function LoginOverlay({ providers, error, onRetry }: LoginOverlayProps) {
  const portalContainer = typeof document !== 'undefined' ? document.body : undefined
  const configuredProviders = (providers ?? []).filter((p) => p.configured)
  const hasProviderInfo = providers !== null

  return (
    <Modal
      isOpen
      defaultOpen
      isDismissable={false}
      hideCloseButton
      placement="center"
      portalContainer={portalContainer}
      classNames={{
        base: 'bg-white dark:bg-gray-900',
        wrapper: 'z-50 !items-center !justify-center p-4',
      }}
    >
      <ModalContent className="max-w-md">
        <ModalHeader className="flex flex-col items-center gap-3">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            Sign in
          </h2>
        </ModalHeader>
        <ModalBody className="text-center pb-6">
          {error ? (
            <p className="text-gray-700 dark:text-gray-300 mb-4">{error}</p>
          ) : (
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              You need to sign in to view workplans.
            </p>
          )}

          {hasProviderInfo ? (
            <div className="flex flex-col gap-3">
              {configuredProviders.map((p) => (
                  <Button
                    key={p.id}
                    as="a"
                    href={p.loginUrl}
                    color="primary"
                    className="w-full"
                  >
                    Continue with {p.displayName}
                  </Button>
              ))}

              {providers && providers.length > 0 && configuredProviders.length === 0 ? (
                <div className="text-left rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 p-3">
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    Sign-in providers are available but not configured on the server.
                  </p>
                  <div className="mt-2 space-y-2">
                    {providers.map((p) => (
                      <div key={p.id} className="text-sm">
                        <div className="font-medium text-gray-900 dark:text-gray-100">
                          {p.displayName}
                        </div>
                        {p.missingConfigKeys && p.missingConfigKeys.length > 0 ? (
                          <div className="text-gray-700 dark:text-gray-300">
                            Missing:
                            <div className="mt-1 font-mono text-xs break-words">
                              {p.missingConfigKeys.join(', ')}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <Button onClick={onRetry} variant="flat" className="w-full">
                Refresh
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <Button onClick={onRetry} color="primary" className="w-full">
                Refresh
              </Button>
            </div>
          )}
        </ModalBody>
      </ModalContent>
    </Modal>
  )
}
