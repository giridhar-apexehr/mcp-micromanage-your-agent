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
  return (
    <Modal
      isOpen
      isDismissable={false}
      hideCloseButton
      classNames={{
        base: 'bg-white dark:bg-gray-900',
        wrapper: 'z-50',
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

          {providers && providers.length > 0 ? (
            <div className="flex flex-col gap-3">
              {providers
                .filter((p) => p.configured)
                .map((p) => (
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
