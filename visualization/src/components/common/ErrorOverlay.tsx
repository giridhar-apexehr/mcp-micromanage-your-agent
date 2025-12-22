/**
 * @file ErrorOverlay
 *
 * Full-screen error overlay used when the application fails to load workplan data.
 */

import { Button } from '@heroui/button'
import { Modal, ModalBody, ModalContent, ModalHeader } from '@heroui/modal'

type ErrorOverlayProps = {
  loadError: string | null
  onReload: () => void
}

/**
 * Displays a blocking error message with a reload action using HeroUI primitives.
 */
export function ErrorOverlay({ loadError, onReload }: ErrorOverlayProps) {
  const portalContainer = typeof document !== 'undefined' ? document.body : undefined

  return (
    <Modal
      isOpen
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
        <ModalHeader className="flex flex-col items-center gap-4">
          <div className="animate-pulse text-5xl">⚠️</div>
          <h2 className="text-xl font-bold text-red-600 dark:text-red-400">
            An error occurred
          </h2>
        </ModalHeader>
        <ModalBody className="text-center pb-6">
          <p className="text-gray-700 dark:text-gray-300 mb-6">
            {loadError || 'Workplan data not found'}
          </p>
          <Button
            onClick={onReload}
            color="primary"
            className="w-full"
          >
            Reload
          </Button>
        </ModalBody>
      </ModalContent>
    </Modal>
  )
}
